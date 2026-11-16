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

const LIST = "GET /assistant/conversations";
const CREATE = "POST /assistant/conversations";
const DETAIL = "GET /assistant/conversations/c1";
const SEND = "POST /assistant/conversations/c1/messages";
const CONFIRM = "POST /assistant/actions/a1/confirm";
const REJECT = "POST /assistant/actions/a1/reject";

const ok = (data, status = 200) => ({ status, data: { data } });
const coded = (status, error, extra = {}) => ({ status, data: { error }, ...extra });
const conv = (over = {}) => ({ id: "c1", title: "Agenda", message_count: 0, created_at: "2026-11-15T12:00:00.000Z", updated_at: "2026-11-15T12:00:00.000Z", ...over });

const proposal = {
  action_id: "a1", tool: "cancel_appointment", summary: "Cancelar o atendimento de Ana", risk: "medium",
  params_preview: { customer_name: "Ana" }, confirm_token: "TOKEN-ABCDEFGHIJ", expires_at: "2099-01-01T00:00:00.000Z",
};

async function ready(handlers, opts) {
  const s = setup({ [LIST]: ok([]), [CREATE]: ok(conv(), 201), ...handlers }, opts);
  await s.ctl.probe();
  return s;
}

describe("sonda de disponibilidade", () => {
  it("habilitado quando a lista responde", async () => {
    const { ctl, state } = await ready({ [LIST]: ok([conv()]) });
    expect(state.status).toBe("enabled");
    expect(state.conversations).toHaveLength(1);
  });

  it("503 assistant_disabled esconde tudo (e não repete a sonda)", async () => {
    const s = setup({ [LIST]: coded(503, { code: "assistant_disabled", message: "x" }) });
    expect(await s.ctl.probe()).toBe("disabled");
    await s.ctl.probe();
    expect(s.calls.filter((c) => c.key === LIST)).toHaveLength(1);
  });

  it("503 sem código (dyno dormindo) fica 'unavailable' e permite nova sonda", async () => {
    let n = 0;
    const s = setup({ [LIST]: () => (++n === 1 ? { status: 503, data: {} } : ok([])) });
    expect(await s.ctl.probe()).toBe("unavailable");
    expect(await s.ctl.probe()).toBe("enabled");
  });

  it("rota inexistente (core antigo) = desabilitado", async () => {
    const s = setup({});
    expect(await s.ctl.probe()).toBe("disabled");
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

  it("402 de recurso (Free pediu ação): mensagem foi gravada, sincroniza e mostra convite", async () => {
    const s = await ready({
      [SEND]: coded(402, { code: "plan_upgrade_required", message: "Ações exigem Premium.", plan: "free", feature: "assistant_actions" }),
      [DETAIL]: ok({ ...conv({ message_count: 1 }), messages: [{ role: "user", content: "cancele", source: "user" }], pending_actions: [] }),
    });
    s.state.activeId = "c1";
    const res = await s.ctl.send("cancele o atendimento");
    expect(res).toMatchObject({ ok: false, reason: "upgrade", accepted: true });
    expect(s.state.notice).toMatchObject({ kind: "upgrade", reason: "feature" });
    expect(s.state.messages.map((m) => m.role)).toEqual(["user"]);
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

  it("resposta recuperada com ação pendente avisa que o botão de confirmar se perdeu", async () => {
    const s = await ready({
      [SEND]: { timeout: true },
      [DETAIL]: detailWith(2, { pending_actions: [{ action_id: "a1", tool: "cancel_appointment", summary: "Cancelar", risk: "medium", expires_at: "2099-01-01T00:00:00.000Z" }] }),
    });
    s.state.activeId = "c1";
    await s.ctl.send("oi");
    expect(s.state.notice.kind).toBe("warning");
    const a = s.state.actions.find((x) => x.actionId === "a1");
    expect(a.token).toBe("");
    expect((await s.ctl.confirm("a1")).reason).toBe("no_token");
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
    [403, { code: "invalid_confirm_token", message: "x" }, "failed"],
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

describe("plano", () => {
  it("lê limite e permissão de ações do plano; falha é silenciosa", async () => {
    const s = await ready({ "GET /billing/subscription": ok({ entitlement: { plan_code: "free", features: { assistant_monthly_interactions: 30, assistant_actions: false } } }) });
    await s.ctl.loadPlan();
    expect(s.state.plan).toMatchObject({ monthlyLimit: 30, actionsEnabled: false });
    const t = await ready({ "GET /billing/subscription": { status: 503, data: {} } });
    await t.ctl.loadPlan();
    expect(t.state.plan).toBeNull();
  });
});
