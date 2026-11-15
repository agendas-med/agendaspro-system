import { describe, it, expect } from "vitest";
import {
  formatWaPhone, formatListTime, formatMessageTime, conversationCategory, normalizeConversation, normalizeConversations,
  assignmentLabel, conversationQuery, filterConversations, sortConversations, refreshLimit, applyConversationRefresh,
  appendConversations, normalizeMessage, normalizeMessages, messageText, mergeMessages, oldestMessageId, isNearBottom,
  normalizeTemplate, normalizeTemplates, selectableTemplates, renderTemplatePreview, suggestTemplateParams, templateStatus,
  buildTextPayload, buildTemplatePayload, classifySendError, safeWaLink, normalizeStatus, configFormFromStatus,
  validateConfigForm, normalizeUsage, currentPeriod, isValidPeriod, periodLabel, messageStatusLabel,
} from "../utils/whatsapp.js";

const rawConv = (over = {}) => ({
  id: 7,
  contact: { wa_id: "5511987654321", name: "Maria", opted_out: false },
  mode: "bot", state: "menu", assigned_user_id: null,
  handoff_at: null, last_inbound_at: "2026-11-15 09:00:00", last_message_at: "2026-11-15 09:05:00",
  window_open: true, last_message: { body: "oi", direction: "in", author: "customer" },
  ...over,
});

function axiosError(status, data, extra = {}) {
  return { response: { status, data }, ...extra };
}

describe("telefone e datas", () => {
  it("formata números BR e internacionais", () => {
    expect(formatWaPhone("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(formatWaPhone("551134567890")).toBe("+55 (11) 3456-7890");
    expect(formatWaPhone("14155550123")).toBe("+14155550123");
    expect(formatWaPhone("")).toBe("");
    expect(formatWaPhone(null)).toBe("");
  });
  it("hora curta na lista (hoje, ontem, data)", () => {
    const now = new Date(2026, 10, 15, 12, 0);
    expect(formatListTime("2026-11-15 09:05:00", now)).toBe("09:05");
    expect(formatListTime("2026-11-14 23:59:00", now)).toBe("ontem");
    expect(formatListTime("2026-10-01 10:00:00", now)).toBe("01/10");
    expect(formatListTime("lixo", now)).toBe("");
    expect(formatListTime(null, now)).toBe("");
  });
  it("hora da mensagem", () => {
    const now = new Date(2026, 10, 15, 12, 0);
    expect(formatMessageTime("2026-11-15 09:05:33", now)).toBe("09:05");
    expect(formatMessageTime("2026-11-10 18:30:00", now)).toBe("10/11 18:30");
  });
});

describe("conversas", () => {
  it("normaliza e deriva o estado", () => {
    const c = normalizeConversation(rawConv());
    expect(c).toMatchObject({ id: 7, name: "Maria", phoneLabel: "+55 (11) 98765-4321", mode: "bot", windowOpen: true, category: "bot" });
    expect(c.lastMessage).toEqual({ body: "oi", direction: "in", author: "customer" });
  });
  it("sem nome do perfil usa o telefone", () => {
    const c = normalizeConversation(rawConv({ contact: { wa_id: "5511987654321", name: null, opted_out: false } }));
    expect(c.name).toBe("+55 (11) 98765-4321");
    expect(c.hasName).toBe(false);
  });
  it("categorias: aguardando, assumida, bot e opt-out (opt-out vence)", () => {
    expect(conversationCategory({ mode: "human", assignedUserId: null })).toBe("waiting");
    expect(conversationCategory({ mode: "human", assignedUserId: 3 })).toBe("assumed");
    expect(conversationCategory({ mode: "bot" })).toBe("bot");
    expect(conversationCategory({ mode: "human", assignedUserId: 3, optedOut: true })).toBe("optout");
  });
  it("mantém texto hostil como texto (sem interpretar nem remover)", () => {
    const evil = '<img src=x onerror=alert(1)> {{ 7*7 }}';
    const c = normalizeConversation(rawConv({ contact: { wa_id: "5511987654321", name: evil, opted_out: false }, last_message: { body: evil, direction: "in", author: "customer" } }));
    expect(c.name).toBe(evil);
    expect(c.lastMessage.body).toBe(evil);
  });
  it("tolera resposta inválida", () => {
    expect(normalizeConversations(null)).toEqual([]);
    expect(normalizeConversations([null, { foo: 1 }, rawConv()])).toHaveLength(1);
  });
  it("rótulo de atendimento", () => {
    const me = 5;
    expect(assignmentLabel(normalizeConversation(rawConv()), me)).toMatch(/bot/);
    expect(assignmentLabel(normalizeConversation(rawConv({ mode: "human" })), me)).toMatch(/Aguardando/);
    expect(assignmentLabel(normalizeConversation(rawConv({ mode: "human", assigned_user_id: 5 })), me)).toBe("Assumida por você");
    expect(assignmentLabel(normalizeConversation(rawConv({ mode: "human", assigned_user_id: 9 })), me)).toMatch(/outro/);
    expect(assignmentLabel(normalizeConversation(rawConv({ contact: { wa_id: "1", opted_out: true } })), me)).toMatch(/não receber/);
  });
  it("consulta só usa parâmetros aceitos pelo core", () => {
    expect(conversationQuery("all")).toEqual({ limit: 50, offset: 0 });
    expect(conversationQuery("waiting", { offset: 50 })).toEqual({ limit: 50, offset: 50, mode: "human" });
    expect(conversationQuery("assumed").mode).toBe("human");
    expect(conversationQuery("bot").mode).toBe("bot");
    expect(conversationQuery("mine")).toEqual({ limit: 50, offset: 0, assigned_to_me: true });
    expect(conversationQuery("optout")).toEqual({ limit: 50, offset: 0 });
    for (const f of ["all", "waiting", "assumed", "bot", "mine", "optout"]) {
      expect(Object.keys(conversationQuery(f)).every((k) => ["mode", "assigned_to_me", "limit", "offset"].includes(k))).toBe(true);
    }
  });
  it("filtra no cliente por categoria", () => {
    const list = normalizeConversations([
      rawConv({ id: 1 }),
      rawConv({ id: 2, mode: "human" }),
      rawConv({ id: 3, mode: "human", assigned_user_id: 4 }),
      rawConv({ id: 4, contact: { wa_id: "5511900000000", opted_out: true } }),
    ]);
    expect(filterConversations(list, "all")).toHaveLength(4);
    expect(filterConversations(list, "waiting").map((c) => c.id)).toEqual([2]);
    expect(filterConversations(list, "assumed").map((c) => c.id)).toEqual([3]);
    expect(filterConversations(list, "bot").map((c) => c.id)).toEqual([1]);
    expect(filterConversations(list, "optout").map((c) => c.id)).toEqual([4]);
  });
  it("ordena como o core: humano primeiro, mais recente, id", () => {
    const list = normalizeConversations([
      rawConv({ id: 1, last_message_at: "2026-11-15 10:00:00" }),
      rawConv({ id: 2, mode: "human", last_message_at: "2026-11-15 08:00:00" }),
      rawConv({ id: 3, last_message_at: "2026-11-15 11:00:00" }),
    ]);
    expect(sortConversations(list).map((c) => c.id)).toEqual([2, 3, 1]);
  });
  it("atualização por polling: substitui quando cabe na requisição, mescla quando passa do limite", () => {
    expect(refreshLimit(10)).toBe(50);
    expect(refreshLimit(70)).toBe(70);
    expect(refreshLimit(500)).toBe(100);
    const old = normalizeConversations([rawConv({ id: 1 }), rawConv({ id: 2 })]);
    const fresh = normalizeConversations([rawConv({ id: 2, mode: "human" })]);
    expect(applyConversationRefresh(old, fresh, 50).map((c) => c.id)).toEqual([2]);

    const many = Array.from({ length: 120 }, (_, i) => normalizeConversation(rawConv({ id: i + 1, last_message_at: `2026-11-01 00:${String(i % 60).padStart(2, "0")}:00` })));
    const merged = applyConversationRefresh(many, [normalizeConversation(rawConv({ id: 5, mode: "human" }))], 100);
    expect(merged).toHaveLength(120);
    expect(merged.find((c) => c.id === 5).mode).toBe("human");
  });
  it("append sem duplicar", () => {
    const a = normalizeConversations([rawConv({ id: 1 }), rawConv({ id: 2 })]);
    const b = normalizeConversations([rawConv({ id: 2 }), rawConv({ id: 3 })]);
    expect(appendConversations(a, b).map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe("mensagens", () => {
  const raw = (id, over = {}) => ({ id, direction: "in", author: "customer", type: "text", body: "olá", status: "received", created_at: "2026-11-15 09:00:00", ...over });

  it("normaliza (ids BIGINT em texto viram número)", () => {
    const m = normalizeMessage(raw("12", { direction: "out", author: "agent", status: "delivered", user_id: 3 }));
    expect(m).toMatchObject({ id: 12, direction: "out", author: "agent", status: "delivered", userId: 3, body: "olá" });
    expect(normalizeMessages([null, {}, raw(1)])).toHaveLength(1);
  });
  it("texto: corpo sempre como string; mídia sem legenda tem aviso", () => {
    expect(messageText(normalizeMessage(raw(1, { body: "<b>x</b>" })))).toBe("<b>x</b>");
    expect(messageText(normalizeMessage(raw(1, { body: null, type: "image" })))).toMatch(/image/);
    expect(messageText(normalizeMessage(raw(1, { body: null })))).toMatch(/sem texto/);
  });
  it("mescla por id: nova versão vence (status de entrega) e ordena", () => {
    const a = normalizeMessages([raw(3, { direction: "out", author: "agent", status: "sent" }), raw(1)]);
    const b = normalizeMessages([raw(3, { direction: "out", author: "agent", status: "read" }), raw(4)]);
    const merged = mergeMessages(a, b);
    expect(merged.map((m) => m.id)).toEqual([1, 3, 4]);
    expect(merged.find((m) => m.id === 3).status).toBe("read");
    expect(oldestMessageId(merged)).toBe(1);
    expect(oldestMessageId([])).toBeNull();
  });
  it("perto do fim da rolagem", () => {
    expect(isNearBottom({ scrollTop: 920, clientHeight: 100, scrollHeight: 1000 })).toBe(true);
    expect(isNearBottom({ scrollTop: 100, clientHeight: 100, scrollHeight: 1000 })).toBe(false);
  });
  it("rótulos de status", () => {
    expect(messageStatusLabel("read")).toBe("Lida");
    expect(messageStatusLabel("zzz")).toBe("");
  });
});

describe("modelos", () => {
  const list = normalizeTemplates([
    { name: "agendamento_lembrete", purpose: "reminder", body_preview: "Olá, {{1}}! Lembrete na {{2}} em {{3}} às {{4}}.", param_count: 4, status: "approved" },
    { name: "atendimento_retomar", purpose: "agent_reopen", body_preview: "Olá! A equipe da {{1}} quer continuar.", param_count: 1, status: "approved" },
    { name: "agendamento_confirmado", purpose: "booking_confirmed", body_preview: "x {{1}}", param_count: 5, status: "pending" },
    { name: "lead_novo", purpose: "lead_notify", body_preview: "y", param_count: 4, status: "approved" },
    { purpose: "sem nome" },
  ]);

  it("normaliza", () => {
    expect(list).toHaveLength(4);
    expect(normalizeTemplate({ name: "a", param_count: "3" }).paramCount).toBe(3);
  });
  it("seletor: só aprovados e sem o aviso interno; retomar primeiro", () => {
    expect(selectableTemplates(list).map((t) => t.name)).toEqual(["atendimento_retomar", "agendamento_lembrete"]);
  });
  it("prévia preenche {{n}} e mantém os vazios", () => {
    expect(renderTemplatePreview(list[0], ["Ana", "Clínica", "", ""])).toBe("Olá, Ana! Lembrete na Clínica em {{3}} às {{4}}.");
    expect(renderTemplatePreview(null, [])).toBe("");
  });
  it("sugere parâmetros", () => {
    expect(suggestTemplateParams(list[1], { contactName: "Ana", companyName: "Clínica X" })).toEqual(["Clínica X"]);
    expect(suggestTemplateParams(list[0], { contactName: "Ana", companyName: "Clínica X" })).toEqual(["Ana", "Clínica X", "", ""]);
    expect(suggestTemplateParams(list[3], { contactName: "Ana" })).toEqual(["", "", "", ""]);
  });
  it("rótulos de status", () => {
    expect(templateStatus("approved").label).toBe("Aprovado");
    expect(templateStatus("pending").tone).toBe("yellow");
    expect(templateStatus("rejected").label).toBe("Reprovado");
    expect(templateStatus("disabled").label).toBe("Desativado");
  });
});

describe("payloads de envio", () => {
  it("texto: apara, valida vazio e limite", () => {
    expect(buildTextPayload("  oi  ")).toEqual({ ok: true, payload: { text: "oi" } });
    expect(buildTextPayload("   ").ok).toBe(false);
    expect(buildTextPayload(null).ok).toBe(false);
    expect(buildTextPayload("a".repeat(4097)).ok).toBe(false);
    expect(buildTextPayload("a".repeat(4096)).ok).toBe(true);
  });
  it("modelo: exige todos os parâmetros e nunca manda texto junto", () => {
    const tpl = { name: "atendimento_retomar", paramCount: 1 };
    expect(buildTemplatePayload(tpl, [" Clínica "])).toEqual({ ok: true, payload: { template: "atendimento_retomar", params: ["Clínica"] } });
    expect(buildTemplatePayload(tpl, [""]).ok).toBe(false);
    expect(buildTemplatePayload(tpl, []).ok).toBe(false);
    expect(buildTemplatePayload(tpl, ["x".repeat(1001)]).ok).toBe(false);
    expect(buildTemplatePayload(null, []).ok).toBe(false);
    expect(buildTemplatePayload({ name: "a", paramCount: 0 }, ["sobra"])).toEqual({ ok: true, payload: { template: "a", params: [] } });
    expect("text" in buildTemplatePayload(tpl, ["x"]).payload).toBe(false);
  });
});

describe("erros do envio", () => {
  const coded = (status, code, extra = {}) => axiosError(status, { error: { code, message: "msg do core", ...extra } });

  it("409 window_closed", () => expect(classifySendError(coded(409, "window_closed")).kind).toBe("window_closed"));
  it("409 opted_out", () => expect(classifySendError(coded(409, "opted_out")).kind).toBe("opted_out"));
  it("409 template_unavailable", () => expect(classifySendError(coded(409, "template_unavailable")).kind).toBe("template_unavailable"));
  it("409 whatsapp_not_configured", () => expect(classifySendError(coded(409, "whatsapp_not_configured")).kind).toBe("not_configured"));
  it("400 template_params usa a mensagem do core", () => {
    const r = classifySendError(coded(400, "template_params"));
    expect(r.kind).toBe("template_params");
    expect(r.message).toBe("msg do core");
  });
  it("402 plan_upgrade_required", () => {
    const r = classifySendError({ ...coded(402, "plan_upgrade_required"), handledGlobally: true });
    expect(r).toMatchObject({ kind: "upgrade", handledGlobally: true });
  });
  it("404 conversation_not_found", () => expect(classifySendError(coded(404, "conversation_not_found")).kind).toBe("not_found"));
  it("502 send_failed é repetível", () => {
    expect(classifySendError(coded(502, "send_failed", { retryable: true }))).toMatchObject({ kind: "send_failed", retryable: true });
    expect(classifySendError(coded(502, "send_failed", { retryable: false })).retryable).toBe(false);
  });
  it("400 Joi { errors } vira validação", () => {
    expect(classifySendError(axiosError(400, { errors: [{ message: "x", field: "text" }] })).kind).toBe("validation");
  });
  it("409 de outro código e erros de rede são genéricos", () => {
    expect(classifySendError(coded(409, "outro")).kind).toBe("generic");
    expect(classifySendError(new Error("Network Error")).kind).toBe("generic");
    expect(classifySendError(null).kind).toBe("generic");
  });
});

describe("status, configuração e uso", () => {
  it("link só https://wa.me/<número>", () => {
    expect(safeWaLink("https://wa.me/5511999999999?text=Agendar%20clinica")).toBe("https://wa.me/5511999999999?text=Agendar%20clinica");
    expect(safeWaLink("javascript:alert(1)")).toBe("");
    expect(safeWaLink("https://evil.com/5511999999999")).toBe("");
    expect(safeWaLink("https://wa.me/abc")).toBe("");
    expect(safeWaLink(null)).toBe("");
  });
  it("normaliza o status (link nulo, padrões ligados)", () => {
    const s = normalizeStatus({ enabled: true, display_phone: "+55 11 99999-9999", wa_link: null, booking_ready: false, settings: { bot_enabled: true, ai_enabled: false, welcome_text: null, ai_daily_token_limit: 2000 }, ai_tokens_today: "15" });
    expect(s).toMatchObject({ enabled: true, waLink: "", bookingReady: false, aiTokensToday: 15 });
    expect(s.settings).toEqual({ botEnabled: true, aiEnabled: false, welcomeText: "", aiDailyTokenLimit: 2000 });
    expect(normalizeStatus(null).enabled).toBe(false);
    expect(normalizeStatus({}).settings.botEnabled).toBe(true);
  });
  it("formulário a partir do status", () => {
    const form = configFormFromStatus(normalizeStatus({ settings: { bot_enabled: false, ai_enabled: true, welcome_text: "Oi", ai_daily_token_limit: null } }));
    expect(form).toEqual({ bot_enabled: false, ai_enabled: true, welcome_text: "Oi", ai_daily_token_limit: "" });
  });
  it("payload de configuração: lista branca, vazio vira null", () => {
    const r = validateConfigForm({ bot_enabled: true, ai_enabled: false, welcome_text: "  ", ai_daily_token_limit: "", extra: "x" });
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({ bot_enabled: true, ai_enabled: false, welcome_text: null, ai_daily_token_limit: null });
    expect(validateConfigForm({ bot_enabled: true, ai_enabled: true, welcome_text: " Olá ", ai_daily_token_limit: "0" }).payload)
      .toEqual({ bot_enabled: true, ai_enabled: true, welcome_text: "Olá", ai_daily_token_limit: 0 });
  });
  it("valida limites do formulário", () => {
    expect(validateConfigForm({ welcome_text: "a".repeat(301) }).errors.welcome_text).toBeTruthy();
    expect(validateConfigForm({ ai_daily_token_limit: "-1" }).errors.ai_daily_token_limit).toBeTruthy();
    expect(validateConfigForm({ ai_daily_token_limit: "1,5" }).errors.ai_daily_token_limit).toBeTruthy();
    expect(validateConfigForm({ ai_daily_token_limit: "1000001" }).errors.ai_daily_token_limit).toBeTruthy();
    expect(validateConfigForm({ ai_daily_token_limit: "1000000" }).ok).toBe(true);
  });

  const usage = (used, limit, plan = "free") => normalizeUsage({ period: "2026-11", plan, messages: { used, limit }, breakdown: { inbound: 3, bot_replies: 2, billable: used, delivered: 1, read: 1, failed: 0 }, ai: { tokens: 10, calls: 2, daily_limit: 4000 } });

  it("uso: percentual e tons", () => {
    expect(usage(10, 50)).toMatchObject({ percent: 20, tone: "green", exceeded: false, near: false, remaining: 40, upgradeInvite: false });
    expect(usage(40, 50)).toMatchObject({ percent: 80, tone: "yellow", near: true });
    expect(usage(50, 50)).toMatchObject({ percent: 100, tone: "red", exceeded: true, upgradeInvite: true, remaining: 0 });
    expect(usage(70, 50).percent).toBe(100);
  });
  it("sem limite (null) não mostra barra nem convite; Premium estourado não convida", () => {
    const u = usage(500, null, "premium");
    expect(u).toMatchObject({ unlimited: true, percent: 0, exceeded: false, upgradeInvite: false, remaining: null });
    expect(usage(100, 100, "premium")).toMatchObject({ exceeded: true, upgradeInvite: false });
  });
  it("usa o limite que a API devolve (não fixa 50)", () => {
    expect(usage(5, 10).percent).toBe(50);
    expect(usage(0, 0)).toMatchObject({ exceeded: true, percent: 100 });
  });
  it("detalhamento e IA", () => {
    const u = usage(3, 50);
    expect(u.breakdown).toEqual({ inbound: 3, botReplies: 2, billable: 3, delivered: 1, read: 1, failed: 0 });
    expect(u.ai).toEqual({ tokens: 10, calls: 2, dailyLimit: 4000 });
    expect(normalizeUsage(null).used).toBe(0);
  });
  it("período", () => {
    expect(currentPeriod(new Date(2026, 10, 3))).toBe("2026-11");
    expect(isValidPeriod("2026-11")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidPeriod("2026-1")).toBe(false);
    expect(periodLabel("2026-11")).toBe("novembro de 2026");
    expect(periodLabel("x")).toBe("");
  });
});
