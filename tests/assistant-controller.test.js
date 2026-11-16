import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { createApiClient, TOKEN_KEY } from "../utils/apiClient.js";
import { createAssistantController, initialState, cooldownLeft } from "../utils/assistantController.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// Cliente real (interceptors incluídos) sobre adaptador falso. Cada handler pode lançar { timeout:true }/{ network:true }.
function setup(handlers, { clientOptions = {}, recovery } = {}) {
  const calls = [];
  const adapter = async (config) => {
    const key = `${String(config.method).toUpperCase()} ${String(config.url).split("?")[0]}`;
    calls.push({ key, body: config.data ? JSON.parse(config.data) : undefined, timeout: config.timeout });
    const h = handlers[key];
    const result = h ? await (typeof h === "function" ? h(config, calls.filter((c) => c.key === key).length) : h) : { status: 404, data: {} };
    if (result && result.network) throw new axios.AxiosError("Network Error", "ERR_NETWORK", config, {});
    if (result && result.timeout) throw new axios.AxiosError("timeout of 45000ms exceeded", "ECONNABORTED", config, {});
    const response = { data: result.data ?? {}, status: result.status ?? 200, statusText: "", headers: result.headers || {}, config, request: {} };
    if (response.status >= 400) throw new axios.AxiosError(`status ${response.status}`, "ERR_BAD_REQUEST", config, {}, response);
    return response;
  };
  const { api } = createApiClient({ axios, baseURL: "http://x", storage: memoryStorage({ [TOKEN_KEY]: "jwt" }), adapter, ...clientOptions });
  let clock = 1_000_000;
  const sleep = vi.fn(async (ms) => { clock += ms; });
  const ctl = createAssistantController({
    api, state: initialState(), now: () => clock, recovery: { intervalMs: 1000, maxMs: 5000, sleep, ...recovery },
  });
  return { ctl, state: ctl.state, calls, sleep, advance: (ms) => { clock += ms; } };
}

const STATUS = "GET /assistant/status";
const LIST = "GET /assistant/conversations";
const CREATE = "POST /assistant/conversations";
const DETAIL = "GET /assistant/conversations/c1";
const DELETE = "DELETE /assistant/conversations/c1";
const SEND = "POST /assistant/conversations/c1/messages";
const CONFIRM = "POST /assistant/actions/a1/confirm";
const REJECT = "POST /assistant/actions/a1/reject";
const TOKEN = "POST /assistant/actions/a1/token";

const statusBody = (over = {}) => ({
  enabled: true, role: "admin", plan: { code: "premium", name: "Premium" },
  usage: { interactions_used: 7, interactions_limit: 1000, period: "2026-11" },
  ai_available: true, rag_enabled: true, actions: { enabled: true, reason: null, tools: ["cancel_appointment"] },
  read_tools: [], knowledge_admin: true, ...over,
});

const ok = (data, status = 200) => ({ status, data: { data } });
const coded = (status, error, extra = {}) => ({ status, data: { error }, ...extra });
const conv = (over = {}) => ({ id: "c1", title: "Agenda", message_count: 0, created_at: "2026-11-15T12:00:00.000Z", updated_at: "2026-11-15T12:00:00.000Z", ...over });

const proposal = {
  action_id: "a1", tool: "cancel_appointment", summary: "Cancelar o atendimento de Ana", risk: "medium",
  params_preview: { customer_name: "Ana" }, confirm_token: "TOKEN-ABCDEFGHIJ", expires_at: "2099-01-01T00:00:00.000Z",
};

async function ready(handlers, opts) {
  const s = setup({ [STATUS]: ok(statusBody()), [LIST]: ok([]), [CREATE]: ok(conv(), 201), ...handlers }, opts);
  await s.ctl.probe();
  return s;
}

describe("status e disponibilidade (A1)", () => {
  it("habilitado pelo /assistant/status: carrega a lista e já mostra plano e cota antes do primeiro envio", async () => {
    const { state, calls } = await ready({ [LIST]: ok([conv()]) });
    expect(state.status).toBe("enabled");
    expect(state.conversations).toHaveLength(1);
    expect(state.usage).toMatchObject({ used: 7, limit: 1000 });
    expect(state.plan).toMatchObject({ planCode: "premium", actionsEnabled: true, aiAvailable: true });
    expect(state.plan.usage).toBeUndefined();
    expect(calls.some((c) => c.key === "GET /billing/subscription")).toBe(false);
  });

  it("enabled:false esconde tudo, sem carregar a lista, e não repete a sonda", async () => {
    const s = setup({ [STATUS]: ok(statusBody({ enabled: false })), [LIST]: ok([conv()]) });
    expect(await s.ctl.probe()).toBe("disabled");
    await s.ctl.probe();
    expect(s.calls.filter((c) => c.key === STATUS)).toHaveLength(1);
    expect(s.calls.some((c) => c.key === LIST)).toBe(false);
  });

  it("503 assistant_disabled no status também esconde tudo", async () => {
    const s = setup({ [STATUS]: coded(503, { code: "assistant_disabled", message: "x" }) });
    expect(await s.ctl.probe()).toBe("disabled");
  });

  it("503 sem código (dyno dormindo) fica 'unavailable' e permite nova sonda", async () => {
    let n = 0;
    const s = setup({ [STATUS]: () => (++n === 1 ? { status: 503, data: {} } : ok(statusBody())), [LIST]: ok([]) });
    expect(await s.ctl.probe()).toBe("unavailable");
    expect(await s.ctl.probe()).toBe("enabled");
  });

  it("rota inexistente (core antigo) = desabilitado", async () => {
    const s = setup({});
    expect(await s.ctl.probe()).toBe("disabled");
  });

  it("plano ilimitado (limite null) vira 'unlimited'; falha ao listar não derruba o status", async () => {
    const s = await ready({
      [STATUS]: ok(statusBody({ usage: { interactions_used: 3, interactions_limit: null } })),
      [LIST]: { status: 500, data: {} },
    });
    expect(s.state.status).toBe("enabled");
    expect(s.state.usage).toMatchObject({ used: 3, limit: null, unlimited: true });
  });

  it("refreshStatus atualiza a cota sem mexer na conversa", async () => {
    let used = 7;
    const s = await ready({ [STATUS]: () => ok(statusBody({ usage: { interactions_used: used, interactions_limit: 1000 } })) });
    used = 12;
    expect(await s.ctl.refreshStatus()).toBe(true);
    expect(s.state.usage.used).toBe(12);
  });
});

describe("envio", () => {
  it("cria a conversa de forma lazy, envia com timeout longo e registra uso, citações e ação", async () => {
    const { ctl, state, calls } = await ready({
      [SEND]: ok({ reply: "Você tem 2 atendimentos.", citations: [{ source_type: "knowledge", source_id: "1", score: 0.8 }], proposed_actions: [proposal], usage: { interactions_used: 3, interactions_limit: 30 } }),
    });
    expect(calls.some((c) => c.key === CREATE)).toBe(false);
    const res = await ctl.send("  agenda de hoje ");
    expect(res.ok).toBe(true);
    expect(calls.find((c) => c.key === CREATE)).toBeTruthy();
    const send = calls.find((c) => c.key === SEND);
    expect(send.body).toEqual({ message: "agenda de hoje" });
    expect(send.timeout).toBe(45000);
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(state.messages[1].citations[0].label).toBe("Base de conhecimento");
    expect(state.usage).toMatchObject({ used: 3, limit: 30 });
    expect(state.actions[0]).toMatchObject({ actionId: "a1", token: "TOKEN-ABCDEFGHIJ", state: "pending", anchor: state.messages[1].key });
    expect(state.sending).toBe(false);
    expect(state.draft).toBe("");
  });

  it("bloqueia envio duplicado enquanto envia e o reenvio imediato do mesmo texto", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { ctl, calls, state } = await ready({ [SEND]: async () => { await gate; return ok({ reply: "ok", usage: { interactions_used: 1, interactions_limit: 30 } }); } });
    state.activeId = "c1";
    const first = ctl.send("oi");
    const second = await ctl.send("outra coisa");
    expect(second).toMatchObject({ ok: false, reason: "busy" });
    release();
    await first;
    expect(calls.filter((c) => c.key === SEND)).toHaveLength(1);
    expect(await ctl.send("oi")).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("recusa texto vazio/longo sem chamar a rede", async () => {
    const { ctl, calls } = await ready({});
    expect(await ctl.send("   ")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await ctl.send("x".repeat(4001))).toMatchObject({ ok: false, reason: "invalid" });
    expect(calls.filter((c) => c.key.startsWith("POST"))).toHaveLength(0);
  });

  it("402 de cota: devolve o texto ao campo, mostra convite e zera o medidor; abre o modal global", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const s = await ready({
      [SEND]: coded(402, { code: "plan_upgrade_required", message: "Limite mensal atingido.", plan: "free", quota: "assistant_monthly_interactions", limit: 30, used: 30 }),
    }, { clientOptions: { onPlanUpgradeRequired } });
    s.state.activeId = "c1";
    const res = await s.ctl.send("quanto faturei?");
    expect(res).toMatchObject({ ok: false, reason: "upgrade" });
    expect(onPlanUpgradeRequired).toHaveBeenCalledTimes(1);
    expect(s.state.notice).toMatchObject({ kind: "upgrade", reason: "quota", handledGlobally: true });
    expect(s.state.usage).toMatchObject({ exhausted: true });
    expect(s.state.draft).toBe("quanto faturei?");
    expect(s.state.messages).toHaveLength(0);
  });

  it("429 rate_limited: cooldown com contagem e bloqueio do envio até acabar", async () => {
    const s = await ready({ [SEND]: coded(429, { code: "rate_limited", message: "x", retry_after: 20 }, { headers: { "retry-after": "20" } }) });
    s.state.activeId = "c1";
    await s.ctl.send("a");
    expect(s.state.notice).toMatchObject({ kind: "warning", retryAfter: 20 });
    expect(cooldownLeft(s.state.cooldownUntil, 1_000_000)).toBe(20);
    expect(await s.ctl.send("b")).toMatchObject({ ok: false, reason: "cooldown", seconds: 20 });
    s.advance(21000);
    expect((await s.ctl.send("b")).reason).not.toBe("cooldown");
  });

  it("429 de orçamento de IA não bloqueia envio (determinísticas seguem)", async () => {
    const s = await ready({ [SEND]: coded(429, { code: "assistant_budget_exceeded", message: "x" }) });
    s.state.activeId = "c1";
    await s.ctl.send("a");
    expect(s.state.notice.tag).toBe("budget");
    expect(s.state.cooldownUntil).toBe(0);
  });

  it("503 assistant_disabled durante o uso desliga a interface", async () => {
    const s = await ready({ [SEND]: coded(503, { code: "assistant_disabled", message: "x" }) });
    s.state.activeId = "c1";
    await s.ctl.send("a");
    expect(s.state.status).toBe("disabled");
  });

  it("A7: 402 de recurso (Free pediu ação) não grava a pergunta nem gasta cota: texto volta ao campo", async () => {
    const s = await ready({
      [SEND]: coded(402, { code: "plan_upgrade_required", message: "Ações exigem Premium.", plan: "free", feature: "assistant_actions" }),
      [STATUS]: ok(statusBody({ plan: { code: "free", name: "Free" }, actions: { enabled: false, reason: "plan", tools: [] } })),
    });
    s.state.activeId = "c1";
    const res = await s.ctl.send("cancele o atendimento");
    expect(res).toMatchObject({ ok: false, reason: "upgrade" });
    expect(res.accepted).toBeUndefined();
    expect(s.state.notice).toMatchObject({ kind: "upgrade", reason: "feature" });
    expect(s.state.messages).toHaveLength(0);
    expect(s.state.draft).toBe("cancele o atendimento");
    // Não precisa reler a conversa (nada foi gravado); só o status é atualizado em segundo plano.
    expect(s.calls.some((c) => c.key === DETAIL)).toBe(false);
    await vi.waitFor(() => expect(s.state.plan).toMatchObject({ actionsEnabled: false, actionsReason: "plan" }));
  });

  it.each([
    [403, { code: "assistant_forbidden", message: "Só administradores." }, "forbidden"],
    [503, { code: "assistant_actions_disabled", message: "x" }, "actions_disabled"],
  ])("A7: %i %s é negação antes de gravar (sem bolha, texto volta ao campo)", async (status, error, reason) => {
    const s = await ready({ [SEND]: coded(status, error) });
    s.state.activeId = "c1";
    const res = await s.ctl.send("cancele o atendimento");
    expect(res).toMatchObject({ ok: false, reason });
    expect(s.state.notice.kind).toBe("warning");
    expect(s.state.messages).toHaveLength(0);
    expect(s.state.draft).toBe("cancele o atendimento");
    expect(s.calls.some((c) => c.key === DETAIL)).toBe(false);
  });

  it("A8: ids da resposta viram a chave das mensagens (m<id>); source/degraded aparecem no balão", async () => {
    const s = await ready({
      [SEND]: ok({ reply: "Resposta automática.", source: "fallback", degraded: true, user_message_id: 41, message_id: 42, proposed_actions: [proposal], usage: { interactions_used: 8, interactions_limit: 1000 } }),
    });
    s.state.activeId = "c1";
    await s.ctl.send("oi");
    expect(s.state.messages.map((m) => m.key)).toEqual(["m41", "m42"]);
    expect(s.state.messages.map((m) => m.id)).toEqual([41, 42]);
    expect(s.state.messages[1]).toMatchObject({ source: "fallback", degraded: true });
    expect(s.state.messages[0].degraded).toBe(false);
    expect(s.state.actions[0].anchor).toBe("m42");
  });

  it("A2: template sozinho não é degradado; degraded:true em template é", async () => {
    const a = await ready({ [SEND]: ok({ reply: "ok", source: "template", degraded: false, message_id: 2, user_message_id: 1 }) });
    a.state.activeId = "c1";
    await a.ctl.send("oi");
    expect(a.state.messages[1].degraded).toBe(false);
    const b = await ready({ [SEND]: ok({ reply: "ok", source: "template", degraded: true, message_id: 2, user_message_id: 1 }) });
    b.state.activeId = "c1";
    await b.ctl.send("oi");
    expect(b.state.messages[1].degraded).toBe(true);
  });

  it("recarregar o histórico mantém citações e o aviso de degradado pelo id da mensagem", async () => {
    const s = await ready({
      [SEND]: ok({ reply: "Texto", source: "template", degraded: true, user_message_id: 1, message_id: 2, citations: [{ source_type: "knowledge", source_id: "1" }] }),
      [DETAIL]: ok({ ...conv({ message_count: 2 }), messages: [{ id: 1, role: "user", content: "oi", source: "user" }, { id: 2, role: "assistant", content: "Texto", source: "template" }], pending_actions: [] }),
    });
    s.state.activeId = "c1";
    await s.ctl.send("oi");
    await s.ctl.reloadActive();
    expect(s.state.messages[1]).toMatchObject({ key: "m2", degraded: true });
    expect(s.state.messages[1].citations).toHaveLength(1);
  });

  it("falha ao criar a conversa: nada enviado, texto volta ao campo", async () => {
    const s = await ready({ [CREATE]: { status: 500, data: {} } });
    const res = await s.ctl.send("oi");
    expect(res.ok).toBe(false);
    expect(s.state.draft).toBe("oi");
    expect(s.state.messages).toHaveLength(0);
    expect(s.calls.some((c) => c.key === SEND)).toBe(false);
  });
});

describe("timeout/rede: recuperação sem reenvio", () => {
  const detailWith = (count, extra = {}) => ok({ ...conv({ message_count: count }), messages: [{ role: "user", content: "oi", source: "user" }, { role: "assistant", content: "Olá!", source: "template" }].slice(0, count), pending_actions: [], ...extra });

  it("a resposta chega depois do timeout: recupera pela conversa, sem POST duplicado", async () => {
    let polls = 0;
    const s = await ready({
      [SEND]: { timeout: true },
      [DETAIL]: () => (++polls < 3 ? detailWith(1) : detailWith(2)),
    });
    s.state.activeId = "c1";
    const res = await s.ctl.send("oi");
    expect(res).toMatchObject({ ok: true, recovered: true });
    expect(s.calls.filter((c) => c.key === SEND)).toHaveLength(1);
    expect(s.state.messages.map((m) => m.content)).toEqual(["oi", "Olá!"]);
    expect(s.state.recovering).toBe(false);
    expect(s.state.sending).toBe(false);
    expect(s.sleep).toHaveBeenCalled();
  });

  it("mensagem não chegou ao servidor: devolve o texto ao campo para o usuário decidir", async () => {
    const s = await ready({ [SEND]: { network: true }, [DETAIL]: detailWith(0, { messages: [] }) });
    s.state.activeId = "c1";
    const res = await s.ctl.send("oi");
    expect(res).toMatchObject({ ok: false, reason: "not_delivered" });
    expect(s.state.draft).toBe("oi");
    expect(s.calls.filter((c) => c.key === SEND)).toHaveLength(1);
  });

  it("gravou mas sem resposta: mantém a mensagem e avisa para não reenviar", async () => {
    const s = await ready({ [SEND]: { status: 502, data: {} }, [DETAIL]: detailWith(1) });
    s.state.activeId = "c1";
    const res = await s.ctl.send("oi");
    expect(res).toMatchObject({ ok: false, reason: "reply_pending", accepted: true });
    expect(s.state.messages.map((m) => m.role)).toEqual(["user"]);
    expect(s.state.draft).toBe("");
  });

  it("sem conexão nem para consultar: não afirma nada e mantém a bolha como incerta", async () => {
    const s = await ready({ [SEND]: { network: true }, [DETAIL]: { network: true } });
    s.state.activeId = "c1";
    const res = await s.ctl.send("oi");
    expect(res.reason).toBe("unknown_outcome");
    expect(s.state.messages[0].state).toBe("unknown");
    expect(s.state.draft).toBe("");
  });

  it("resposta recuperada com ação pendente avisa que falta a confirmação e aponta para 'Preparar confirmação'", async () => {
    const s = await ready({
      [SEND]: { timeout: true },
      [DETAIL]: detailWith(2, { pending_actions: [{ action_id: "a1", tool: "cancel_appointment", summary: "Cancelar", risk: "medium", expires_at: "2099-01-01T00:00:00.000Z" }] }),
    });
    s.state.activeId = "c1";
    await s.ctl.send("oi");
    expect(s.state.notice.kind).toBe("warning");
    expect(s.state.notice.message).toMatch(/Preparar confirmação/);
    const a = s.state.actions.find((x) => x.actionId === "a1");
    expect(a.token).toBe("");
    expect((await s.ctl.confirm("a1")).reason).toBe("no_token");
    expect(s.calls.some((c) => c.key === TOKEN || c.key === CONFIRM)).toBe(false);
  });
});

describe("confirmar e rejeitar", () => {
  async function withAction(handlers = {}, opts) {
    const s = await ready({ [SEND]: ok({ reply: "Preparei.", proposed_actions: [proposal], usage: { interactions_used: 1, interactions_limit: 1000 } }), ...handlers }, opts);
    s.state.activeId = "c1";
    await s.ctl.send("cancele a Ana");
    return s;
  }

  it("nada é executado sem chamar confirm(): a proposta só cria o cartão", async () => {
    const s = await withAction();
    expect(s.calls.some((c) => c.key === CONFIRM)).toBe(false);
    expect(s.state.actions[0].state).toBe("pending");
  });

  it("confirma enviando SÓ o confirm_token do core; descarta o token e mostra o resultado", async () => {
    const s = await withAction({ [CONFIRM]: ok({ action_id: "a1", status: "executed", tool: "cancel_appointment", summary: "Atendimento cancelado", result: { appointment: "Ana 10:00" } }) });
    const res = await s.ctl.confirm("a1");
    expect(res.ok).toBe(true);
    const call = s.calls.find((c) => c.key === CONFIRM);
    expect(call.body).toEqual({ confirm_token: "TOKEN-ABCDEFGHIJ" });
    expect(call.timeout).toBe(45000);
    const a = s.state.actions[0];
    expect(a).toMatchObject({ state: "executed", token: "" });
    expect(a.result.summary).toBe("Atendimento cancelado");
    expect((await s.ctl.confirm("a1")).reason).toBe("busy");
  });

  it("dois cliques rápidos geram uma única confirmação", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await withAction({ [CONFIRM]: async () => { await gate; return ok({ action_id: "a1", status: "executed", summary: "ok" }); } });
    const first = s.ctl.confirm("a1");
    expect((await s.ctl.confirm("a1")).reason).toBe("busy");
    release();
    await first;
    expect(s.calls.filter((c) => c.key === CONFIRM)).toHaveLength(1);
  });

  it.each([
    [410, { code: "action_expired", message: "x" }, "expired"],
    [409, { code: "action_already_processed", message: "x" }, "processed"],
    [403, { code: "assistant_forbidden", message: "só admin" }, "denied"],
    [422, { code: "action_failed", message: "Horário ocupado." }, "failed"],
    [404, { code: "action_not_found", message: "x" }, "gone"],
  ])("confirm %i %s -> estado %s e token descartado", async (status, error, finalState) => {
    const s = await withAction({ [CONFIRM]: coded(status, error) });
    await s.ctl.confirm("a1");
    expect(s.state.actions[0]).toMatchObject({ state: finalState, token: "" });
    expect(s.state.actions[0].error).toBeTruthy();
  });

  it("422 action_failed mostra a mensagem segura do core", async () => {
    const s = await withAction({ [CONFIRM]: coded(422, { code: "action_failed", message: "Horário ocupado." }) });
    await s.ctl.confirm("a1");
    expect(s.state.actions[0].error).toBe("Horário ocupado.");
  });

  it("402 no confirm (Free): estado negado com convite de upgrade", async () => {
    const s = await withAction({ [CONFIRM]: coded(402, { code: "plan_upgrade_required", message: "Ações exigem Premium.", plan: "free", feature: "assistant_actions" }) });
    await s.ctl.confirm("a1");
    expect(s.state.actions[0]).toMatchObject({ state: "denied", upgrade: true, token: "" });
  });

  it("expirada no relógio local: não chama a rede", async () => {
    const s = await withAction();
    s.state.actions[0].expiresAt = 1_000_000 - 1;
    const res = await s.ctl.confirm("a1");
    expect(res.reason).toBe("expired");
    expect(s.calls.some((c) => c.key === CONFIRM)).toBe(false);
  });

  it("timeout no confirm: estado incerto, token mantido; 'verificar' consulta antes de qualquer nova tentativa", async () => {
    const pendingList = [{ action_id: "a1", tool: "cancel_appointment", summary: "Cancelar", risk: "medium", expires_at: "2099-01-01T00:00:00.000Z" }];
    let pending = pendingList;
    const s = await withAction({
      [CONFIRM]: { timeout: true },
      [DETAIL]: () => ok({ ...conv({ message_count: 2 }), messages: [], pending_actions: pending }),
    });
    await s.ctl.confirm("a1");
    expect(s.state.actions[0]).toMatchObject({ state: "unknown", token: "TOKEN-ABCDEFGHIJ" });
    expect(s.calls.filter((c) => c.key === CONFIRM)).toHaveLength(1);

    // O servidor ainda a tem como pendente: volta a pendente e o usuário pode confirmar de novo.
    await s.ctl.verifyAction("a1");
    expect(s.state.actions[0].state).toBe("pending");

    // Se sumiu da lista de pendentes (executada/rejeitada): não oferece nova execução.
    pending = [];
    s.state.actions[0].state = "unknown";
    await s.ctl.verifyAction("a1");
    expect(s.state.actions[0]).toMatchObject({ state: "processed", token: "" });
  });

  it("rejeitar: não envia token e marca como rejeitada", async () => {
    const s = await withAction({ [REJECT]: ok({ action_id: "a1", status: "rejected" }) });
    const res = await s.ctl.reject("a1");
    expect(res.ok).toBe(true);
    const call = s.calls.find((c) => c.key === REJECT);
    expect(call.body).toBeUndefined();
    expect(s.state.actions[0]).toMatchObject({ state: "rejected", token: "" });
  });

  it("rejeitar funciona para ação restaurada do histórico (sem token)", async () => {
    const s = await ready({
      [DETAIL]: ok({ ...conv({ message_count: 2 }), messages: [], pending_actions: [{ action_id: "a1", tool: "adjust_stock", summary: "Ajustar", risk: "low", expires_at: "2099-01-01T00:00:00.000Z" }] }),
      [REJECT]: ok({ action_id: "a1", status: "rejected" }),
    });
    await s.ctl.openConversation("c1");
    expect(s.state.actions[0].token).toBe("");
    expect((await s.ctl.confirm("a1")).reason).toBe("no_token");
    expect((await s.ctl.reject("a1")).ok).toBe(true);
  });
});

describe("conversas e sessão", () => {
  it("abrir conversa carrega o histórico; conversa inexistente sai da lista", async () => {
    const s = await ready({
      [LIST]: ok([conv(), conv({ id: "c2", title: "Outra" })]),
      [DETAIL]: ok({ ...conv({ message_count: 2 }), messages: [{ role: "user", content: "oi" }, { role: "assistant", content: "olá", source: "ai" }], pending_actions: [] }),
      "GET /assistant/conversations/c2": coded(404, { code: "conversation_not_found", message: "x" }),
    });
    expect(await s.ctl.openConversation("c1")).toBe(true);
    expect(s.state.messages).toHaveLength(2);
    expect(await s.ctl.openConversation("c2")).toBe(false);
    expect(s.state.conversations.map((c) => c.id)).toEqual(["c1"]);
  });

  it("reset (logout/troca de empresa) descarta tokens e ignora respostas atrasadas", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await ready({ [SEND]: async () => { await gate; return ok({ reply: "tarde", proposed_actions: [proposal] }); } });
    s.state.activeId = "c1";
    const pending = s.ctl.send("oi");
    s.ctl.reset();
    release();
    await pending;
    expect(s.state.actions).toEqual([]);
    expect(s.state.messages).toEqual([]);
    expect(s.state.status).toBe("unknown");
  });

  it("não troca de conversa enquanto envia", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await ready({ [SEND]: async () => { await gate; return ok({ reply: "x" }); } });
    s.state.activeId = "c1";
    const pending = s.ctl.send("oi");
    expect(await s.ctl.openConversation("c9")).toBe(false);
    expect(s.ctl.startNew()).toBe(false);
    release();
    await pending;
  });
});

describe("reemitir o token de uma ação pendente (A4)", () => {
  const PENDING = { action_id: "a1", tool: "cancel_appointment", summary: "Cancelar o atendimento de Ana", risk: "medium", expires_at: "2099-01-01T00:00:00.000Z" };
  const reissued = { action_id: "a1", summary: "Cancelar o atendimento de Ana", expires_at: "2099-01-01T00:00:00.000Z", confirm_token: "NOVO-TOKEN-123456", params_preview: null };

  async function restored(handlers = {}) {
    const s = await ready({
      [DETAIL]: ok({ ...conv({ message_count: 2 }), messages: [], pending_actions: [PENDING] }),
      [CONFIRM]: ok({ action_id: "a1", status: "executed", tool: "cancel_appointment", summary: "Atendimento cancelado" }),
      ...handlers,
    });
    await s.ctl.openConversation("c1");
    return s;
  }

  it("abrir a conversa NÃO gera token nem confirma: a ação fica pendente sem token", async () => {
    const s = await restored({ [TOKEN]: ok(reissued) });
    expect(s.state.actions[0]).toMatchObject({ actionId: "a1", state: "pending", token: "" });
    expect(s.calls.some((c) => c.key === TOKEN)).toBe(false);
    expect(s.calls.some((c) => c.key === CONFIRM)).toBe(false);
  });

  it("clique em 'Preparar confirmação': guarda o token novo e segue pendente, SEM confirmar", async () => {
    const s = await restored({ [TOKEN]: ok(reissued) });
    const res = await s.ctl.reissueToken("a1");
    expect(res.ok).toBe(true);
    expect(s.state.actions[0]).toMatchObject({ state: "pending", token: "NOVO-TOKEN-123456", expiresAt: Date.parse("2099-01-01T00:00:00.000Z") });
    expect(s.calls.filter((c) => c.key === TOKEN)).toHaveLength(1);
    expect(s.calls.some((c) => c.key === CONFIRM)).toBe(false);
  });

  it("só o segundo clique (Confirmar) executa, enviando o token novo", async () => {
    const s = await restored({ [TOKEN]: ok(reissued) });
    await s.ctl.reissueToken("a1");
    const res = await s.ctl.confirm("a1");
    expect(res.ok).toBe(true);
    const order = s.calls.map((c) => c.key).filter((k) => k === TOKEN || k === CONFIRM);
    expect(order).toEqual([TOKEN, CONFIRM]);
    expect(s.calls.find((c) => c.key === CONFIRM).body).toEqual({ confirm_token: "NOVO-TOKEN-123456" });
    expect(s.state.actions[0]).toMatchObject({ state: "executed", token: "" });
  });

  it("clique duplo gera uma única reemissão", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await restored({ [TOKEN]: async () => { await gate; return ok(reissued); } });
    const first = s.ctl.reissueToken("a1");
    expect(s.state.actions[0].state).toBe("reissuing");
    expect((await s.ctl.reissueToken("a1")).reason).toBe("busy");
    expect((await s.ctl.confirm("a1")).reason).toBe("busy");
    release();
    await first;
    expect(s.calls.filter((c) => c.key === TOKEN)).toHaveLength(1);
    expect((await s.ctl.reissueToken("a1")).reason).toBe("has_token");
  });

  it("não reemite token de ação já expirada no relógio local", async () => {
    const s = await restored({ [TOKEN]: ok(reissued) });
    s.state.actions[0].expiresAt = 1_000_000 - 1;
    expect((await s.ctl.reissueToken("a1")).reason).toBe("expired");
    expect(s.calls.some((c) => c.key === TOKEN)).toBe(false);
    expect(s.state.actions[0].state).toBe("expired");
  });

  it.each([
    [410, { code: "action_expired", message: "x" }, "expired"],
    [409, { code: "action_already_processed", message: "x" }, "processed"],
    [404, { code: "action_not_found", message: "x" }, "gone"],
    [403, { code: "assistant_forbidden", message: "só admin" }, "denied"],
    [503, { code: "assistant_actions_disabled", message: "x" }, "denied"],
  ])("reemissão %i %s -> estado %s, sem token", async (status, error, finalState) => {
    const s = await restored({ [TOKEN]: coded(status, error) });
    const res = await s.ctl.reissueToken("a1");
    expect(res.ok).toBe(false);
    expect(s.state.actions[0]).toMatchObject({ state: finalState, token: "" });
  });

  it("falha de rede ao reemitir: segue pendente, sem token, pode tentar de novo", async () => {
    let n = 0;
    const s = await restored({ [TOKEN]: () => (++n === 1 ? { network: true } : ok(reissued)) });
    expect((await s.ctl.reissueToken("a1")).ok).toBe(false);
    expect(s.state.actions[0]).toMatchObject({ state: "pending", token: "" });
    expect(s.state.actions[0].error).toMatch(/Tente de novo/);
    expect((await s.ctl.reissueToken("a1")).ok).toBe(true);
    expect(s.state.actions[0].token).toBe("NOVO-TOKEN-123456");
  });

  it("token antigo recusado (403 invalid_confirm_token): ação segue pendente, token descartado, pede nova preparação", async () => {
    const s = await ready({
      [SEND]: ok({ reply: "Preparei.", proposed_actions: [proposal], usage: { interactions_used: 1, interactions_limit: 1000 } }),
      [CONFIRM]: coded(403, { code: "invalid_confirm_token", message: "x" }),
      [TOKEN]: ok({ ...reissued, confirm_token: "TOKEN-DEPOIS-123456" }),
    });
    s.state.activeId = "c1";
    await s.ctl.send("cancele a Ana");
    await s.ctl.confirm("a1");
    expect(s.state.actions[0]).toMatchObject({ state: "pending", token: "" });
    expect(s.state.actions[0].error).toMatch(/Preparar confirmação/);
    expect((await s.ctl.reissueToken("a1")).ok).toBe(true);
    expect(s.state.actions[0].token).toBe("TOKEN-DEPOIS-123456");
  });

  it("reset durante a reemissão descarta o token recebido", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await restored({ [TOKEN]: async () => { await gate; return ok(reissued); } });
    const pending = s.ctl.reissueToken("a1");
    s.ctl.reset();
    release();
    expect((await pending).reason).toBe("reset");
    expect(s.state.actions).toEqual([]);
  });
});

describe("excluir conversa (A8)", () => {
  it("DELETE e remove da lista, das ações e da tela quando era a aberta", async () => {
    const s = await ready({
      [LIST]: ok([conv(), conv({ id: "c2", title: "Outra" })]),
      [DETAIL]: ok({ ...conv({ message_count: 2 }), messages: [{ id: 1, role: "user", content: "oi" }], pending_actions: [{ action_id: "a1", tool: "cancel_appointment", summary: "Cancelar", risk: "medium", expires_at: "2099-01-01T00:00:00.000Z" }] }),
      [DELETE]: { status: 200, data: { data: { ok: true } } },
    });
    await s.ctl.openConversation("c1");
    expect(s.state.actions).toHaveLength(1);
    const res = await s.ctl.deleteConversation("c1");
    expect(res.ok).toBe(true);
    expect(s.calls.filter((c) => c.key === DELETE)).toHaveLength(1);
    expect(s.state.conversations.map((c) => c.id)).toEqual(["c2"]);
    expect(s.state.actions).toEqual([]);
    expect(s.state).toMatchObject({ activeId: "", messages: [], deletingId: "" });
  });

  it("excluir outra conversa não mexe na aberta", async () => {
    const s = await ready({
      [LIST]: ok([conv(), conv({ id: "c2" })]),
      [DETAIL]: ok({ ...conv({ message_count: 1 }), messages: [{ id: 1, role: "user", content: "oi" }], pending_actions: [] }),
      "DELETE /assistant/conversations/c2": { status: 204, data: "" },
    });
    await s.ctl.openConversation("c1");
    expect((await s.ctl.deleteConversation("c2")).ok).toBe(true);
    expect(s.state.activeId).toBe("c1");
    expect(s.state.messages).toHaveLength(1);
    expect(s.state.conversations.map((c) => c.id)).toEqual(["c1"]);
  });

  it("404 conversation_not_found = já excluída: limpa localmente e conta como sucesso", async () => {
    const s = await ready({ [LIST]: ok([conv()]), [DELETE]: coded(404, { code: "conversation_not_found", message: "x" }) });
    const res = await s.ctl.deleteConversation("c1");
    expect(res).toMatchObject({ ok: true, alreadyGone: true });
    expect(s.state.conversations).toEqual([]);
  });

  it("erro de rede: mantém a conversa e avisa", async () => {
    const s = await ready({ [LIST]: ok([conv()]), [DELETE]: { network: true } });
    const res = await s.ctl.deleteConversation("c1");
    expect(res.ok).toBe(false);
    expect(s.state.conversations).toHaveLength(1);
    expect(s.state.notice).toMatchObject({ kind: "error" });
    expect(s.state.deletingId).toBe("");
  });

  it("bloqueia durante envio e durante outra exclusão", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await ready({
      [LIST]: ok([conv()]),
      [SEND]: async () => { await gate; return ok({ reply: "x" }); },
      [DELETE]: { status: 200, data: {} },
    });
    s.state.activeId = "c1";
    const pending = s.ctl.send("oi");
    expect((await s.ctl.deleteConversation("c1")).reason).toBe("busy");
    release();
    await pending;
    expect(s.calls.some((c) => c.key === DELETE)).toBe(false);
  });
});
