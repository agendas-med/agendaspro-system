// Controlador do assistente interno: estado e fluxos (sonda de disponibilidade, conversas, envio com trava,
// recuperação por consulta quando a resposta se perde, confirmação/rejeição de ações, cooldown de 429).
// Puro: `api` (axios), `state` (objeto simples ou reactive do Vue) e timers são injetados.
//
// Regras de segurança:
//  - nada de escrita sem clique: confirm() só roda por chamada explícita da tela e só envia o confirm_token do core;
//  - o confirm_token vive só em memória (no objeto da ação) e é descartado ao concluir/expirar/trocar de empresa;
//  - sem chave de idempotência no core: uma mensagem cujo resultado é incerto (timeout/rede/5xx) NUNCA é
//    reenviada sozinha; reconcilia-se consultando a conversa (message_count).
import { unwrap } from "./payloads.js";
import {
  LONG_REQUEST_TIMEOUT_MS, DUPLICATE_SEND_WINDOW_MS,
  validateMessage, classifyAssistantError, normalizeConversation, normalizeConversations,
  normalizeConversationDetail, normalizeCitations, normalizeProposedAction, normalizeConfirmResult,
  normalizeUsage, usageView, planFromSubscription, isExpired,
} from "./assistant.js";

export const RECOVERY_INTERVAL_MS = 3000;
export const RECOVERY_MAX_MS = 60000;

export function initialState() {
  return {
    // unknown | probing | enabled | disabled | unavailable  (disabled/unknown => a interface do assistente fica escondida)
    status: "unknown",
    statusMessage: "",
    conversations: [],
    conversationsLoading: false,
    activeId: "",
    activeCount: 0,
    messages: [],
    loadingMessages: false,
    actions: [],
    draft: "",
    sending: false,
    recovering: false,
    notice: null, // { kind: info|warning|error|upgrade, message, ... }
    usage: null,
    plan: null,
    cooldownUntil: 0,
  };
}

// Segundos que faltam para o fim do cooldown de 429.
export const cooldownLeft = (until, nowMs) => Math.max(0, Math.ceil((until - nowMs) / 1000));

export function createAssistantController({
  api,
  state = initialState(),
  now = () => Date.now(),
  longTimeout = LONG_REQUEST_TIMEOUT_MS,
  recovery = {},
} = {}) {
  const intervalMs = recovery.intervalMs ?? RECOVERY_INTERVAL_MS;
  const maxAttempts = Math.max(1, Math.ceil((recovery.maxMs ?? RECOVERY_MAX_MS) / intervalMs));
  const sleep = recovery.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let epoch = 0; // invalida continuações assíncronas após reset() (logout/troca de empresa)
  let seq = 0;
  let probing = null;
  let lastSend = null;

  const nextKey = () => `l${++seq}`;
  const setNotice = (kind, message, extra = {}) => { state.notice = { kind, message, ...extra }; };
  const clearNotice = () => { state.notice = null; };
  const findAction = (id) => state.actions.find((a) => a.actionId === id);

  function reset() {
    epoch += 1;
    probing = null;
    lastSend = null;
    Object.assign(state, initialState());
  }

  // ---- Disponibilidade -----------------------------------------------------

  // A rota de lista serve de sonda (não existe /assistant/status): 503 assistant_disabled => esconder tudo.
  async function probe(force = false) {
    if (!force && (state.status === "enabled" || state.status === "disabled")) return state.status;
    if (probing) return probing;
    const my = epoch;
    if (state.status === "unknown") state.status = "probing";
    probing = (async () => {
      try {
        const res = await api.get("/assistant/conversations");
        if (my !== epoch) return state.status;
        state.conversations = normalizeConversations(unwrap(res));
        state.status = "enabled";
        state.statusMessage = "";
      } catch (error) {
        if (my !== epoch) return state.status;
        const c = classifyAssistantError(error);
        const status = error && error.response && error.response.status;
        if (c.kind === "disabled" || status === 404) {
          state.status = "disabled";
        } else {
          // Dyno dormindo, rede ou sessão: não esconde para sempre; a próxima tentativa refaz a sonda.
          state.status = "unavailable";
          state.statusMessage = c.message || "O assistente não respondeu agora.";
        }
      } finally {
        probing = null;
      }
      return state.status;
    })();
    return probing;
  }

  // Limite do plano (informativo). Silencioso: a cobrança pode estar desligada ou a rota indisponível.
  async function loadPlan() {
    const my = epoch;
    try {
      const res = await api.get("/billing/subscription");
      if (my !== epoch) return;
      state.plan = planFromSubscription(unwrap(res));
    } catch (error) {
      if (my === epoch) state.plan = null;
    }
  }

  async function refreshConversations() {
    const my = epoch;
    state.conversationsLoading = true;
    try {
      const res = await api.get("/assistant/conversations");
      if (my !== epoch) return false;
      state.conversations = normalizeConversations(unwrap(res));
      return true;
    } catch (error) {
      if (my !== epoch) return false;
      if (classifyAssistantError(error).kind === "disabled") state.status = "disabled";
      return false;
    } finally {
      if (my === epoch) state.conversationsLoading = false;
    }
  }

  // ---- Conversa ativa ------------------------------------------------------

  function mergeActions(conversationId, pending, { authoritative }) {
    const serverIds = new Set(pending.map((a) => a.actionId));
    for (const incoming of pending) {
      const existing = findAction(incoming.actionId);
      if (existing) {
        // Mantém token/estado locais; só atualiza o que o servidor sabe.
        existing.summary = existing.summary || incoming.summary;
        existing.expiresAt = incoming.expiresAt ?? existing.expiresAt;
      } else {
        state.actions.push({ ...incoming, conversationId });
      }
    }
    if (authoritative) {
      // Pendente localmente mas ausente da lista do servidor (que só traz pendentes não vencidas): já foi decidida.
      for (const a of state.actions) {
        if (a.conversationId !== conversationId || serverIds.has(a.actionId)) continue;
        if (a.state === "pending" || a.state === "unknown") {
          a.state = isExpired(a.expiresAt, now()) ? "expired" : "processed";
          a.token = "";
        }
      }
    }
  }

  function applyDetail(detail) {
    const id = detail.conversation.id;
    state.activeId = id;
    state.activeCount = detail.conversation.messageCount;
    // O core não persiste citações: preserva as já exibidas quando o texto da resposta é o mesmo.
    const previous = state.messages;
    state.messages = detail.messages.map((m) => {
      const old = previous.find((p) => p.role === "assistant" && p.content === m.content && p.citations && p.citations.length);
      return old ? { ...m, citations: old.citations, truncated: old.truncated } : m;
    });
    const keys = new Set(state.messages.map((m) => m.key));
    for (const a of state.actions) {
      if (a.conversationId === id && a.anchor && !keys.has(a.anchor)) a.anchor = "";
    }
    mergeActions(id, detail.pending, { authoritative: true });
    const idx = state.conversations.findIndex((c) => c.id === id);
    if (idx >= 0) state.conversations.splice(idx, 1, { ...state.conversations[idx], ...detail.conversation, title: detail.conversation.title || state.conversations[idx].title });
  }

  async function openConversation(id) {
    if (state.sending || state.recovering) return false;
    const my = ++epoch;
    clearNotice();
    state.loadingMessages = true;
    try {
      const res = await api.get(`/assistant/conversations/${encodeURIComponent(id)}`);
      if (my !== epoch) return false;
      state.messages = [];
      applyDetail(normalizeConversationDetail(unwrap(res)));
      return true;
    } catch (error) {
      if (my !== epoch) return false;
      const c = classifyAssistantError(error);
      if (c.kind === "not_found") {
        state.conversations = state.conversations.filter((x) => x.id !== id);
        if (state.activeId === id) {
          state.activeId = "";
          state.messages = [];
        }
      } else if (c.kind === "disabled") {
        state.status = "disabled";
      }
      setNotice(c.kind === "not_found" ? "warning" : "error", c.message || "Não foi possível abrir a conversa.");
      return false;
    } finally {
      if (my === epoch) state.loadingMessages = false;
    }
  }

  // Recarrega a conversa ativa (sincroniza com o servidor). Silencioso em erro.
  async function reloadActive() {
    const id = state.activeId;
    if (!id) return false;
    const my = epoch;
    try {
      const res = await api.get(`/assistant/conversations/${encodeURIComponent(id)}`);
      if (my !== epoch || state.activeId !== id) return false;
      applyDetail(normalizeConversationDetail(unwrap(res)));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Conversa nova: só é criada no servidor no primeiro envio (evita conversas vazias).
  function startNew() {
    if (state.sending || state.recovering) return false;
    epoch += 1;
    state.activeId = "";
    state.activeCount = 0;
    state.messages = [];
    state.draft = "";
    clearNotice();
    return true;
  }

  // ---- Envio ---------------------------------------------------------------

  const dropMessage = (msg) => {
    const i = state.messages.indexOf(msg);
    if (i >= 0) state.messages.splice(i, 1);
  };

  const restoreDraft = (text) => {
    if (!state.draft) state.draft = text;
  };

  async function send(text) {
    const v = validateMessage(text);
    if (!v.ok) return { ok: false, reason: "invalid", error: v.error };
    if (state.status !== "enabled") return { ok: false, reason: "disabled" };
    if (state.sending || state.recovering) return { ok: false, reason: "busy" };
    const t = now();
    if (state.cooldownUntil > t) return { ok: false, reason: "cooldown", seconds: cooldownLeft(state.cooldownUntil, t) };
    if (lastSend && lastSend.text === v.text && t - lastSend.at < DUPLICATE_SEND_WINDOW_MS) return { ok: false, reason: "duplicate" };

    const my = epoch;
    lastSend = { text: v.text, at: t };
    state.sending = true;
    state.draft = "";
    clearNotice();
    const userMsg = { key: nextKey(), role: "user", content: v.text, source: "user", intent: "", createdAt: "", state: "sending", citations: [], truncated: false };
    state.messages.push(userMsg);
    // Mantém o objeto reativo (o push em state.messages devolve o proxy ao ler de novo).
    const bubble = state.messages[state.messages.length - 1];

    try {
      let convId = state.activeId;
      if (!convId) {
        try {
          const created = normalizeConversation(unwrap(await api.post("/assistant/conversations")));
          if (my !== epoch) return { ok: false, reason: "reset" };
          if (!created.id) throw new Error("Resposta sem id");
          convId = created.id;
          state.activeId = convId;
          state.activeCount = 0;
          state.conversations.unshift(created);
        } catch (error) {
          if (my !== epoch) return { ok: false, reason: "reset" };
          return await failSend(error, bubble, v.text, my, null, 0);
        }
      }
      const base = state.activeCount;
      try {
        const res = await api.post(`/assistant/conversations/${encodeURIComponent(convId)}/messages`, { message: v.text }, { timeout: longTimeout });
        if (my !== epoch) return { ok: false, reason: "reset" };
        applyReply(unwrap(res) || {}, bubble, convId, base);
        return { ok: true };
      } catch (error) {
        if (my !== epoch) return { ok: false, reason: "reset" };
        return await failSend(error, bubble, v.text, my, convId, base);
      }
    } finally {
      if (my === epoch) state.sending = false;
    }
  }

  function applyReply(data, bubble, convId, base) {
    bubble.state = "ok";
    const reply = {
      key: nextKey(), role: "assistant", content: String(data.reply == null ? "" : data.reply), source: "", intent: "",
      createdAt: "", state: "ok", citations: normalizeCitations(data.citations), truncated: data.truncated === true,
    };
    state.messages.push(reply);
    const anchor = state.messages[state.messages.length - 1].key;
    for (const raw of Array.isArray(data.proposed_actions) ? data.proposed_actions : []) {
      const action = normalizeProposedAction(raw);
      if (!action.actionId) continue;
      action.anchor = anchor;
      action.conversationId = convId;
      const existing = findAction(action.actionId);
      if (existing) Object.assign(existing, action);
      else state.actions.push(action);
    }
    const usage = normalizeUsage(data.usage, state.plan && state.plan.monthlyLimit);
    if (usage) state.usage = usage;
    state.activeCount = base + 2;
    if (data.truncated === true) setNotice("info", "Sua mensagem era muito longa e foi encurtada antes de ser enviada.");
    // A lista (título, contagem) é atualizada em segundo plano.
    refreshConversations();
  }

  async function failSend(error, bubble, text, my, convId, base) {
    const c = classifyAssistantError(error);

    if (c.kind === "disabled") {
      state.status = "disabled";
      dropMessage(bubble);
      return { ok: false, reason: "disabled" };
    }

    if (c.outcomeUnknown && convId) {
      return recoverSend(c, bubble, text, my, convId, base);
    }
    if (c.outcomeUnknown) {
      // Falha ao criar a conversa: nada foi enviado ainda; pode tentar de novo.
      dropMessage(bubble);
      restoreDraft(text);
      setNotice("error", c.message, { tag: c.kind });
      return { ok: false, reason: c.kind, error: c.message };
    }

    const acceptedWithoutReply = c.accepted === true || c.kind === "forbidden" || (c.kind === "upgrade" && c.reason === "feature");
    if (acceptedWithoutReply && convId) {
      // A mensagem foi gravada (e a cota consumida) mas a proposta falhou: sincroniza e avisa.
      bubble.state = "ok";
      await reloadActive();
      setNotice(c.kind === "upgrade" ? "upgrade" : "warning", c.message, c.kind === "upgrade" ? { reason: c.reason, handledGlobally: c.handledGlobally } : {});
      return { ok: false, reason: c.kind, error: c.message, accepted: true };
    }

    // Rejeitada antes de gravar: some com a bolha e devolve o texto ao campo (nada foi consumido).
    dropMessage(bubble);
    restoreDraft(text);
    if (c.kind === "rate_limited") {
      state.cooldownUntil = now() + c.retryAfter * 1000;
      setNotice("warning", c.message, { tag: "rate_limited", retryAfter: c.retryAfter });
    } else if (c.kind === "upgrade") {
      if (c.limit != null && c.used != null) state.usage = usageView(c.used, c.limit);
      setNotice("upgrade", c.message, { reason: c.reason, quota: c.quota, handledGlobally: c.handledGlobally });
    } else if (c.kind === "budget") {
      setNotice("warning", c.message, { tag: "budget" });
    } else if (c.kind === "not_found") {
      state.conversations = state.conversations.filter((x) => x.id !== convId);
      state.activeId = "";
      state.messages = [];
      setNotice("warning", c.message);
    } else {
      setNotice("error", c.message || "Não foi possível enviar a mensagem.");
    }
    return { ok: false, reason: c.kind, error: c.message };
  }

  // O resultado do envio é incerto (timeout, rede, 5xx sem código). Não reenvia: consulta a conversa até
  // enxergar user+assistant (message_count >= base + 2) ou esgotar a espera.
  async function recoverSend(c, bubble, text, my, convId, base) {
    bubble.state = "unknown";
    state.recovering = true;
    setNotice("info", c.message, { tag: "recovering" });
    let stored = false;
    let reached = false;
    let detail = null;
    try {
      for (let i = 0; i < maxAttempts; i += 1) {
        await sleep(intervalMs);
        if (my !== epoch) return { ok: false, reason: "reset" };
        try {
          const res = await api.get(`/assistant/conversations/${encodeURIComponent(convId)}`);
          if (my !== epoch) return { ok: false, reason: "reset" };
          reached = true;
          detail = normalizeConversationDetail(unwrap(res));
          const count = detail.conversation.messageCount;
          if (count >= base + 2) {
            applyDetail(detail);
            const lost = state.actions.some((a) => a.conversationId === convId && a.state === "pending" && !a.token);
            setNotice(lost ? "warning" : "info", lost
              ? "A resposta chegou, mas a conexão caiu antes de receber os botões de confirmação. Para executar a ação, peça novamente."
              : "A resposta chegou. A conexão tinha falhado, mas nada foi enviado em duplicidade.");
            return { ok: true, recovered: true };
          }
          if (count >= base + 1) stored = true;
        } catch (error) {
          if (classifyAssistantError(error).kind === "not_found") break;
        }
      }
      if (my !== epoch) return { ok: false, reason: "reset" };
      if (stored && detail) {
        applyDetail(detail);
        setNotice("warning", "Sua mensagem chegou, mas a resposta ainda não apareceu. Abra o histórico em instantes antes de enviar de novo.");
        return { ok: false, reason: "reply_pending", accepted: true };
      }
      if (reached) {
        dropMessage(bubble);
        restoreDraft(text);
        setNotice("warning", "Sua mensagem não chegou ao servidor. Você pode enviar de novo.");
        return { ok: false, reason: "not_delivered" };
      }
      setNotice("warning", "Sem conexão: não sei se a mensagem foi enviada. Confira o histórico antes de enviar de novo.");
      return { ok: false, reason: "unknown_outcome" };
    } finally {
      if (my === epoch) state.recovering = false;
    }
  }

  // ---- Ações (só por clique do usuário) -------------------------------------

  async function confirm(actionId) {
    const a = findAction(actionId);
    if (!a) return { ok: false, reason: "not_found" };
    if (a.state !== "pending") return { ok: false, reason: "busy" };
    if (!a.token) return { ok: false, reason: "no_token" };
    if (isExpired(a.expiresAt, now())) {
      a.state = "expired";
      a.token = "";
      return { ok: false, reason: "expired" };
    }
    const my = epoch;
    a.state = "confirming";
    a.error = "";
    try {
      const res = await api.post(`/assistant/actions/${encodeURIComponent(actionId)}/confirm`, { confirm_token: a.token }, { timeout: longTimeout });
      if (my !== epoch) return { ok: false, reason: "reset" };
      a.result = normalizeConfirmResult(unwrap(res));
      a.state = "executed";
      a.token = "";
      return { ok: true };
    } catch (error) {
      if (my !== epoch) return { ok: false, reason: "reset" };
      return settleActionError(a, error, "confirm");
    }
  }

  async function reject(actionId) {
    const a = findAction(actionId);
    if (!a) return { ok: false, reason: "not_found" };
    if (a.state !== "pending" && a.state !== "unknown") return { ok: false, reason: "busy" };
    const my = epoch;
    a.state = "rejecting";
    a.error = "";
    try {
      await api.post(`/assistant/actions/${encodeURIComponent(actionId)}/reject`, undefined, { timeout: longTimeout });
      if (my !== epoch) return { ok: false, reason: "reset" };
      a.state = "rejected";
      a.token = "";
      return { ok: true };
    } catch (error) {
      if (my !== epoch) return { ok: false, reason: "reset" };
      return settleActionError(a, error, "reject");
    }
  }

  function settleActionError(a, error, phase) {
    const c = classifyAssistantError(error);
    a.error = c.message;
    switch (c.kind) {
      case "expired":
        a.state = "expired"; a.token = ""; break;
      case "processed":
        a.state = "processed"; a.token = ""; break;
      case "failed":
      case "invalid_token":
        a.state = "failed"; a.token = ""; break;
      case "not_found":
        a.state = "gone"; a.token = ""; break;
      case "upgrade":
        a.state = "denied"; a.token = ""; a.upgrade = true; break;
      case "forbidden":
        a.state = "denied"; a.token = ""; break;
      case "disabled":
        state.status = "disabled"; a.state = "gone"; a.token = ""; break;
      case "actions_disabled":
        a.state = "denied"; a.token = ""; break;
      default:
        // Timeout/rede/5xx: incerto. O token é de uso único no core, então verificar e tentar de novo é seguro.
        a.state = c.outcomeUnknown ? "unknown" : "pending";
        if (c.outcomeUnknown) {
          a.error = phase === "confirm"
            ? "Não recebi a resposta do servidor: a ação pode ou não ter sido executada. Use \"Verificar\" antes de tentar de novo."
            : "Não recebi a resposta do servidor. Use \"Verificar\" para ver se a ação ainda está pendente.";
        }
    }
    return { ok: false, reason: c.kind, error: a.error };
  }

  // Consulta a conversa para saber se a ação continua pendente (resultado incerto).
  async function verifyAction(actionId) {
    const a = findAction(actionId);
    if (!a || !a.conversationId) return { ok: false, reason: "not_found" };
    const my = epoch;
    try {
      const res = await api.get(`/assistant/conversations/${encodeURIComponent(a.conversationId)}`);
      if (my !== epoch) return { ok: false, reason: "reset" };
      const detail = normalizeConversationDetail(unwrap(res));
      const stillPending = detail.pending.some((p) => p.actionId === actionId);
      if (stillPending) {
        a.state = "pending";
        a.error = a.token
          ? "A ação ainda está pendente e não foi executada. Você pode confirmar de novo."
          : "A ação ainda está pendente, mas o botão de confirmar só vale na resposta original. Peça de novo ao assistente.";
      } else {
        a.state = isExpired(a.expiresAt, now()) ? "expired" : "processed";
        a.token = "";
        a.error = a.state === "expired"
          ? "A ação expirou sem ser executada."
          : "A ação não está mais pendente: pode ter sido executada ou rejeitada. Confira na agenda.";
      }
      if (state.activeId === a.conversationId) applyDetail(detail);
      return { ok: true, pending: stillPending };
    } catch (error) {
      if (my !== epoch) return { ok: false, reason: "reset" };
      const c = classifyAssistantError(error);
      a.error = c.kind === "not_found" ? "A conversa não existe mais." : "Ainda sem conexão. Tente verificar de novo em instantes.";
      return { ok: false, reason: c.kind };
    }
  }

  return {
    state, reset, probe, loadPlan, refreshConversations, openConversation, reloadActive, startNew,
    send, confirm, reject, verifyAction, dismissNotice: clearNotice,
  };
}
