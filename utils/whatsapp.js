// WhatsApp (F4): normalizadores, regras de estado, payloads e tratamento de erros (puros, testáveis).
// Contrato: agendaspro-core/docs/contratos-f4.md + routes/whatsapp.js. Respostas { data }.
// Todo texto vindo de clientes (nome do perfil, corpo das mensagens) é dado NÃO CONFIÁVEL:
// as telas só o exibem como texto (interpolação), nunca como HTML.

export const CONVERSATION_PAGE_SIZE = 50;
export const MESSAGE_PAGE_SIZE = 50;
export const POLL_INTERVAL_MS = 15000;
export const MAX_TEXT_LENGTH = 4096;
export const MAX_PARAM_LENGTH = 1000;
export const MAX_WELCOME_LENGTH = 300;
export const MAX_AI_TOKEN_LIMIT = 1000000;
export const QUOTA_NEAR_PERCENT = 80;

const toInt = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const toText = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));

// ---------------------------------------------------------------------------
// Telefone / datas (hora de parede "YYYY-MM-DD HH:mm:ss", sem fuso, como o core envia)
// ---------------------------------------------------------------------------

// "5511999998888" -> "+55 (11) 99999-8888". Fora do padrão BR: "+<dígitos>".
export function formatWaPhone(waId) {
  const digits = toText(waId).replace(/\D/g, "");
  if (!digits) return "";
  const br = digits.match(/^55(\d{2})(\d{8,9})$/);
  if (br) {
    const local = br[2];
    const body = local.length === 9 ? `${local.slice(0, 5)}-${local.slice(5)}` : `${local.slice(0, 4)}-${local.slice(4)}`;
    return `+55 (${br[1]}) ${body}`;
  }
  return `+${digits}`;
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

export function parseWall(value) {
  const m = WALL.exec(toText(value).trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

const pad = (n) => String(n).padStart(2, "0");

// Hoje -> "HH:mm"; ontem -> "ontem"; depois -> "DD/MM". `now` é injetável (testes).
export function formatListTime(value, now = new Date()) {
  const w = parseWall(value);
  if (!w) return "";
  const today = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
  if (w.y === today.y && w.mo === today.mo && w.d === today.d) return `${pad(w.h)}:${pad(w.mi)}`;
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (w.y === yest.getFullYear() && w.mo === yest.getMonth() + 1 && w.d === yest.getDate()) return "ontem";
  return `${pad(w.d)}/${pad(w.mo)}`;
}

// Hoje -> "HH:mm"; senão "DD/MM HH:mm".
export function formatMessageTime(value, now = new Date()) {
  const w = parseWall(value);
  if (!w) return "";
  const hm = `${pad(w.h)}:${pad(w.mi)}`;
  const isToday = w.y === now.getFullYear() && w.mo === now.getMonth() + 1 && w.d === now.getDate();
  return isToday ? hm : `${pad(w.d)}/${pad(w.mo)} ${hm}`;
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

export const AUTHOR_LABELS = { customer: "Cliente", bot: "Bot", agent: "Atendente", system: "Sistema" };

export const CONVERSATION_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "waiting", label: "Aguardando atendente" },
  { value: "mine", label: "Minhas" },
  { value: "assumed", label: "Assumidas" },
  { value: "bot", label: "Com o bot" },
  { value: "optout", label: "Opt-out" },
];

// Estado exibido: opt-out > aguardando (humano sem responsável) > assumida > bot.
export function conversationCategory(conv) {
  if (!conv) return "bot";
  if (conv.optedOut) return "optout";
  if (conv.mode === "human") return conv.assignedUserId ? "assumed" : "waiting";
  return "bot";
}

const CATEGORY_TAGS = {
  waiting: { label: "Aguardando atendente", tone: "yellow" },
  assumed: { label: "Assumida", tone: "green" },
  bot: { label: "Com o bot", tone: "" },
  optout: { label: "Opt-out", tone: "red" },
};

export function categoryTag(category) {
  return CATEGORY_TAGS[category] || CATEGORY_TAGS.bot;
}

export function normalizeLastMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    body: toText(raw.body),
    direction: raw.direction === "out" ? "out" : "in",
    author: toText(raw.author),
  };
}

export function normalizeConversation(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const contact = r.contact && typeof r.contact === "object" ? r.contact : {};
  const waId = toText(contact.wa_id);
  const phoneLabel = formatWaPhone(waId);
  const profileName = toText(contact.name).trim();
  const conv = {
    id: toInt(r.id),
    waId,
    phoneLabel,
    name: profileName || phoneLabel || "Contato sem nome",
    hasName: !!profileName,
    optedOut: !!contact.opted_out,
    mode: r.mode === "human" ? "human" : "bot",
    state: toText(r.state),
    assignedUserId: toInt(r.assigned_user_id),
    handoffAt: toText(r.handoff_at),
    lastInboundAt: toText(r.last_inbound_at),
    lastMessageAt: toText(r.last_message_at),
    windowOpen: !!r.window_open,
    lastMessage: normalizeLastMessage(r.last_message),
  };
  conv.category = conversationCategory(conv);
  return conv;
}

export function normalizeConversations(list) {
  return (Array.isArray(list) ? list : []).map(normalizeConversation).filter((c) => c.id != null);
}

// Quem atende: texto curto para o cabeçalho da conversa.
export function assignmentLabel(conv, currentUserId) {
  if (!conv) return "";
  if (conv.optedOut) return "O cliente pediu para não receber mensagens";
  if (conv.mode !== "human") return "Atendimento automático (bot)";
  if (!conv.assignedUserId) return "Aguardando um atendente";
  return conv.assignedUserId === toInt(currentUserId) ? "Assumida por você" : "Assumida por outro atendente";
}

// Filtros que o core entende: só `mode` e `assigned_to_me` (qualquer outro parâmetro dá 400).
// "optout" e "all" não têm filtro no servidor; "optout" é refinado no cliente.
export function conversationQuery(filter, { limit = CONVERSATION_PAGE_SIZE, offset = 0 } = {}) {
  const params = { limit, offset };
  if (filter === "waiting" || filter === "assumed") params.mode = "human";
  else if (filter === "bot") params.mode = "bot";
  else if (filter === "mine") params.assigned_to_me = true;
  return params;
}

export function filterConversations(list, filter) {
  const items = Array.isArray(list) ? list : [];
  switch (filter) {
    case "waiting": return items.filter((c) => c.category === "waiting");
    case "assumed": return items.filter((c) => c.category === "assumed");
    case "bot": return items.filter((c) => c.category === "bot");
    case "optout": return items.filter((c) => c.category === "optout");
    default: return items;
  }
}

// Mesma ordem do core: humano primeiro, mais recente primeiro, id desc.
export function sortConversations(list) {
  return [...list].sort((a, b) => {
    if ((a.mode === "human") !== (b.mode === "human")) return a.mode === "human" ? -1 : 1;
    if (a.lastMessageAt !== b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    return b.id - a.id;
  });
}

// Atualização por polling: se tudo que já foi carregado cabe numa única requisição (limit ≤ 100),
// a lista é substituída (some quem mudou de estado); senão, mescla por id preservando o resto.
export const MAX_CONVERSATION_LIMIT = 100;

export function refreshLimit(loadedCount) {
  return Math.min(MAX_CONVERSATION_LIMIT, Math.max(CONVERSATION_PAGE_SIZE, toInt(loadedCount) || 0));
}

export function applyConversationRefresh(existing, incoming, requestedLimit) {
  const old = Array.isArray(existing) ? existing : [];
  if (old.length <= requestedLimit) return incoming;
  const byId = new Map(old.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return sortConversations([...byId.values()]);
}

// Acrescenta a próxima página sem duplicar.
export function appendConversations(existing, page) {
  const seen = new Set(existing.map((c) => c.id));
  return [...existing, ...page.filter((c) => !seen.has(c.id))];
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  received: "Recebida",
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
};

export function messageStatusLabel(status) {
  return STATUS_LABELS[status] || "";
}

export function normalizeMessage(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const direction = r.direction === "out" ? "out" : "in";
  return {
    id: toInt(r.id),
    direction,
    author: toText(r.author) || (direction === "in" ? "customer" : "agent"),
    userId: toInt(r.user_id),
    type: toText(r.type) || "text",
    body: toText(r.body),
    templateName: toText(r.template_name),
    status: toText(r.status),
    errorCode: toText(r.error_code),
    createdAt: toText(r.created_at),
    statusAt: toText(r.status_at),
  };
}

export function normalizeMessages(list) {
  return (Array.isArray(list) ? list : []).map(normalizeMessage).filter((m) => m.id != null);
}

// Texto exibível: mídia sem legenda não tem corpo.
export function messageText(msg) {
  if (!msg) return "";
  if (msg.body) return msg.body;
  if (msg.type && msg.type !== "text") return `[mensagem de ${msg.type} sem texto]`;
  return "[mensagem sem texto]";
}

// Mescla por id (a versão nova vence: traz também mudança de status de entrega) e ordena por id.
export function mergeMessages(existing, incoming) {
  const byId = new Map();
  for (const m of Array.isArray(existing) ? existing : []) byId.set(m.id, m);
  for (const m of Array.isArray(incoming) ? incoming : []) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function oldestMessageId(messages) {
  return messages && messages.length ? messages[0].id : null;
}

// Rolagem: só acompanha as novidades se o usuário já está perto do fim.
export function isNearBottom({ scrollTop, clientHeight, scrollHeight }, threshold = 80) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

// ---------------------------------------------------------------------------
// Modelos (templates)
// ---------------------------------------------------------------------------

const TEMPLATE_STATUS = {
  approved: { label: "Aprovado", tone: "green" },
  pending: { label: "Pendente na Meta", tone: "yellow" },
  rejected: { label: "Reprovado", tone: "red" },
  disabled: { label: "Desativado", tone: "" },
};

export function templateStatus(status) {
  return TEMPLATE_STATUS[status] || { label: status ? String(status) : "—", tone: "" };
}

const PURPOSE_LABELS = {
  reminder: "Lembrete de agendamento",
  booking_confirmed: "Confirmação de agendamento",
  booking_rescheduled: "Agendamento remarcado",
  agent_reopen: "Retomar atendimento",
  lead_notify: "Aviso interno da plataforma",
};

export function templatePurposeLabel(purpose) {
  return PURPOSE_LABELS[purpose] || toText(purpose) || "—";
}

export function normalizeTemplate(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    name: toText(r.name),
    language: toText(r.language),
    category: toText(r.category),
    purpose: toText(r.purpose),
    bodyPreview: toText(r.body_preview),
    paramCount: Math.max(0, toInt(r.param_count) || 0),
    status: toText(r.status),
    syncedAt: toText(r.synced_at),
  };
}

export function normalizeTemplates(list) {
  return (Array.isArray(list) ? list : []).map(normalizeTemplate).filter((t) => t.name);
}

// Só modelos aprovados podem ser enviados; o de aviso interno (lead_notify) não é para clientes.
export function selectableTemplates(list) {
  const items = (Array.isArray(list) ? list : []).filter((t) => t.status === "approved" && t.purpose !== "lead_notify");
  return items.sort((a, b) => (a.purpose === "agent_reopen" ? -1 : 0) - (b.purpose === "agent_reopen" ? -1 : 0));
}

// Prévia com os parâmetros preenchidos ({{n}} sem valor permanece como está). Sempre texto.
export function renderTemplatePreview(template, params = []) {
  const body = template ? template.bodyPreview : "";
  return body.replace(/\{\{(\d+)\}\}/g, (match, n) => {
    const value = params[Number(n) - 1];
    return typeof value === "string" && value.trim() ? value.trim() : match;
  });
}

// Sugestão de preenchimento: nome do cliente e da empresa onde o texto do modelo os espera.
export function suggestTemplateParams(template, { contactName = "", companyName = "" } = {}) {
  const count = template ? template.paramCount : 0;
  const params = Array(count).fill("");
  if (!template || !count) return params;
  if (template.purpose === "agent_reopen") {
    params[0] = companyName;
  } else if (["reminder", "booking_confirmed", "booking_rescheduled"].includes(template.purpose)) {
    params[0] = contactName;
    if (count > 1) params[1] = companyName;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Envio: payloads (lista branca; `text` XOR `template`) e validação local
// ---------------------------------------------------------------------------

export function buildTextPayload(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return { ok: false, error: "Digite uma mensagem para enviar." };
  if (value.length > MAX_TEXT_LENGTH) return { ok: false, error: `A mensagem pode ter até ${MAX_TEXT_LENGTH} caracteres.` };
  return { ok: true, payload: { text: value } };
}

export function buildTemplatePayload(template, params) {
  if (!template || !template.name) return { ok: false, error: "Escolha um modelo." };
  const values = (Array.isArray(params) ? params : []).slice(0, template.paramCount)
    .map((p) => (typeof p === "string" ? p.trim() : ""));
  if (values.length !== template.paramCount || values.some((v) => !v)) {
    return { ok: false, error: `Preencha os ${template.paramCount} parâmetro(s) do modelo.` };
  }
  if (values.some((v) => v.length > MAX_PARAM_LENGTH)) {
    return { ok: false, error: `Cada parâmetro pode ter até ${MAX_PARAM_LENGTH} caracteres.` };
  }
  return { ok: true, payload: { template: template.name, params: values } };
}

// Mapeia os erros do envio (POST /whatsapp/conversations/:id/messages) para uma ação de tela.
//  kind: window_closed | opted_out | template_unavailable | template_params | upgrade |
//        not_found | not_configured | send_failed | validation | generic
export function classifySendError(error) {
  const status = error && error.response && error.response.status;
  const body = error && error.response && error.response.data;
  const coded = body && typeof body === "object" && body.error && typeof body.error === "object" ? body.error : null;
  const code = coded && typeof coded.code === "string" ? coded.code : "";

  const make = (kind, message, extra = {}) => ({ kind, message, ...extra });

  if (status === 409 && code === "window_closed") {
    return make("window_closed", "A janela de 24 horas está fechada. Envie um modelo aprovado para retomar a conversa.");
  }
  if (status === 409 && code === "opted_out") {
    return make("opted_out", "O cliente pediu para não receber mensagens (PARAR). O envio está bloqueado.");
  }
  if (status === 409 && code === "template_unavailable") {
    return make("template_unavailable", "Este modelo não está disponível (inexistente ou ainda não aprovado pela Meta). Escolha outro.");
  }
  if (status === 409 && code === "whatsapp_not_configured") {
    return make("not_configured", "O WhatsApp da plataforma ainda não está configurado. Tente novamente mais tarde.");
  }
  if (status === 400 && code === "template_params") {
    return make("template_params", coded.message || "Quantidade de parâmetros do modelo incorreta.");
  }
  if (status === 402 && code === "plan_upgrade_required") {
    return make("upgrade", (coded && coded.message) || "O limite de mensagens do seu plano foi atingido.", { handledGlobally: !!(error && error.handledGlobally) });
  }
  if (status === 404 && code === "conversation_not_found") {
    return make("not_found", "Esta conversa não existe mais ou não pertence à sua empresa.");
  }
  if (status === 502 || code === "send_failed") {
    return make("send_failed", "A Meta não aceitou o envio agora. Tente novamente em instantes.", { retryable: coded ? coded.retryable !== false : true });
  }
  if (status === 400) {
    return make("validation", "Mensagem inválida. Revise o texto e tente novamente.");
  }
  return make("generic", "");
}

export function isConversationNotFound(error) {
  return classifySendError(error).kind === "not_found";
}

// ---------------------------------------------------------------------------
// Status, configuração e uso
// ---------------------------------------------------------------------------

// O link vem do core (https://wa.me/<número>?text=...), mas só é usado se tiver exatamente essa forma.
export function safeWaLink(url) {
  const text = toText(url).trim();
  return /^https:\/\/wa\.me\/\d{6,20}(\?[A-Za-z0-9%_.~=&-]*)?$/.test(text) ? text : "";
}

export function normalizeStatus(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = r.settings && typeof r.settings === "object" ? r.settings : {};
  return {
    enabled: !!r.enabled,
    displayPhone: toText(r.display_phone),
    waLink: safeWaLink(r.wa_link),
    bookingReady: !!r.booking_ready,
    settings: {
      botEnabled: s.bot_enabled !== false,
      aiEnabled: s.ai_enabled !== false,
      welcomeText: toText(s.welcome_text),
      aiDailyTokenLimit: toInt(s.ai_daily_token_limit),
    },
    aiTokensToday: toInt(r.ai_tokens_today) || 0,
  };
}

export function configFormFromStatus(status) {
  const s = status && status.settings ? status.settings : normalizeStatus({}).settings;
  return {
    bot_enabled: s.botEnabled,
    ai_enabled: s.aiEnabled,
    welcome_text: s.welcomeText,
    ai_daily_token_limit: s.aiDailyTokenLimit == null ? "" : String(s.aiDailyTokenLimit),
  };
}

// PUT /whatsapp/config (admin): só os 4 campos conhecidos. Limite vazio = null (usa o do plano).
export function validateConfigForm(form) {
  const f = form || {};
  const errors = {};
  const welcome = typeof f.welcome_text === "string" ? f.welcome_text.trim() : "";
  if (welcome.length > MAX_WELCOME_LENGTH) errors.welcome_text = `A mensagem de boas-vindas pode ter até ${MAX_WELCOME_LENGTH} caracteres.`;

  let limit = null;
  const rawLimit = f.ai_daily_token_limit;
  if (rawLimit !== "" && rawLimit != null) {
    const text = String(rawLimit).trim();
    const n = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n > MAX_AI_TOKEN_LIMIT) {
      errors.ai_daily_token_limit = `Informe um número inteiro entre 0 e ${MAX_AI_TOKEN_LIMIT.toLocaleString("pt-BR")} ou deixe em branco.`;
    } else {
      limit = n;
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors: {},
    payload: {
      bot_enabled: !!f.bot_enabled,
      ai_enabled: !!f.ai_enabled,
      welcome_text: welcome || null,
      ai_daily_token_limit: limit,
    },
  };
}

export function normalizeUsage(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const m = r.messages && typeof r.messages === "object" ? r.messages : {};
  const b = r.breakdown && typeof r.breakdown === "object" ? r.breakdown : {};
  const ai = r.ai && typeof r.ai === "object" ? r.ai : {};
  const used = Math.max(0, toInt(m.used) || 0);
  const limit = m.limit == null ? null : Math.max(0, toInt(m.limit) ?? 0);
  const exceeded = limit != null && used >= limit;
  const percent = limit == null ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const plan = toText(r.plan);
  return {
    period: toText(r.period),
    plan,
    used,
    limit,
    unlimited: limit == null,
    remaining: limit == null ? null : Math.max(0, limit - used),
    percent,
    exceeded,
    near: limit != null && !exceeded && percent >= QUOTA_NEAR_PERCENT,
    tone: exceeded ? "red" : limit != null && percent >= QUOTA_NEAR_PERCENT ? "yellow" : "green",
    // Convite de upgrade: limite estourado e plano que não é o Premium.
    upgradeInvite: exceeded && plan !== "premium",
    breakdown: {
      inbound: toInt(b.inbound) || 0,
      botReplies: toInt(b.bot_replies) || 0,
      billable: toInt(b.billable) || 0,
      delivered: toInt(b.delivered) || 0,
      read: toInt(b.read) || 0,
      failed: toInt(b.failed) || 0,
    },
    ai: { tokens: toInt(ai.tokens) || 0, calls: toInt(ai.calls) || 0, dailyLimit: toInt(ai.daily_limit) || 0 },
  };
}

// "2026-11" do mês atual (hora local do navegador); usado no seletor de período.
export function currentPeriod(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function isValidPeriod(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(toText(value));
}

export function periodLabel(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(toText(period));
  if (!m) return "";
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${months[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

// ---------------------------------------------------------------------------
// Polling leve (sem websocket): só com a aba visível, sem sobreposição, silencioso em erro.
// Timers e visibilidade são injetados (testável sem navegador).
// ---------------------------------------------------------------------------
export function createPoller({
  task,
  intervalMs = POLL_INTERVAL_MS,
  isVisible = () => true,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  onError,
}) {
  let running = false;
  let timer = null;
  let inflight = false;

  const schedule = () => {
    if (!running || timer !== null) return;
    timer = setTimer(tick, intervalMs);
  };

  async function tick() {
    timer = null;
    if (!running) return;
    if (!isVisible()) return; // pausado: retoma em notifyVisibility()
    if (inflight) {
      schedule();
      return;
    }
    inflight = true;
    try {
      await task();
    } catch (error) {
      if (onError) {
        try { onError(error); } catch (e) { /* silencioso */ }
      }
    } finally {
      inflight = false;
    }
    schedule();
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    // Chamar em `visibilitychange`: oculta pausa; visível atualiza já e retoma o intervalo.
    notifyVisibility() {
      if (!running) return;
      if (isVisible()) {
        if (timer !== null) {
          clearTimer(timer);
          timer = null;
        }
        if (!inflight) tick();
      } else if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
    isRunning: () => running,
    isPending: () => timer !== null,
  };
}
