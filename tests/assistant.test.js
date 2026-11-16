import { describe, it, expect } from "vitest";
import axios from "axios";
import {
  MAX_MESSAGE_LENGTH, validateMessage, normalizeConversations, normalizeConversationDetail, normalizeCitations,
  normalizeProposedAction, normalizePendingAction, previewRows, normalizeUsage, usageView, normalizeStatus,
  actionsReasonLabel, classifyAssistantError, classifyKnowledgeError, retryAfterSeconds, parseInstant, formatCountdown,
  isExpired, validateKnowledgeForm, normalizeKnowledgeList, normalizeKnowledgeItem, knowledgePatch, knowledgeFormFromItem,
  emptyKnowledgeForm, toolLabel, riskLabel, linkOptions, formatWhen, formatListWhen, zonedParts, isDegraded,
  degradedNotice, normalizeMessage, normalizeReissuedAction,
} from "../utils/assistant.js";
import { describeQuota, planUpgradeInfo } from "../utils/planErrors.js";

const err = (status, error, extra = {}) => {
  const e = new axios.AxiosError("x", "ERR_BAD_REQUEST", {}, {}, { status, data: { error }, headers: {}, ...extra });
  return e;
};

describe("validateMessage", () => {
  it("recusa vazio e acima de 4000; aparada o texto", () => {
    expect(validateMessage("   ").ok).toBe(false);
    expect(validateMessage("x".repeat(MAX_MESSAGE_LENGTH + 1)).ok).toBe(false);
    expect(validateMessage("  oi  ")).toEqual({ ok: true, text: "oi" });
  });
});

describe("conversas e histórico", () => {
  it("ordena pela atualização mais recente e ignora itens sem id", () => {
    const list = normalizeConversations([
      { id: "a", title: "A", message_count: 2, updated_at: "2026-01-01T10:00:00.000Z" },
      { id: "b", title: null, message_count: "4", updated_at: "2026-01-02T10:00:00.000Z" },
      { title: "sem id" },
    ]);
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    expect(list[0].messageCount).toBe(4);
    expect(normalizeConversations(null)).toEqual([]);
  });

  it("detalhe: mensagens, ações pendentes (sem token) e expiração como instante", () => {
    const d = normalizeConversationDetail({
      id: "c1", title: "t", message_count: 3,
      messages: [{ role: "user", content: "oi", source: "user" }, { role: "assistant", content: "olá", source: "fallback" }],
      pending_actions: [{ action_id: "ac1", tool: "cancel_appointment", summary: "Cancelar", risk: "medium", expires_at: "2026-11-15T12:00:00.000Z" }],
    });
    expect(d.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(d.pending[0]).toMatchObject({ actionId: "ac1", token: "", state: "pending", expiresAt: Date.parse("2026-11-15T12:00:00.000Z") });
    expect(d.messages[1]).toMatchObject({ degraded: true });
    expect(d.messages[0].degraded).toBe(false);
  });

  it("mensagens têm id (A8): a chave é m<id>; sem id cai para a posição", () => {
    expect(normalizeMessage({ id: 41, role: "user", content: "oi" }, 0)).toMatchObject({ id: 41, key: "m41" });
    expect(normalizeMessage({ role: "assistant", content: "x" }, 3)).toMatchObject({ id: null, key: "h3" });
  });
});

describe("fuso horário (A6: created_at é UTC com Z)", () => {
  it("converte o mesmo instante para o fuso pedido, sem somar ou tirar horas à mão", () => {
    const iso = "2026-11-15T15:30:00.000Z";
    const now = new Date("2026-11-15T20:00:00.000Z");
    expect(formatWhen(iso, now, "America/Sao_Paulo")).toBe("12:30");
    expect(formatWhen(iso, now, "UTC")).toBe("15:30");
    // Em Tóquio o mesmo instante já é 16/11; "hoje" também é decidido nesse fuso.
    expect(formatWhen(iso, now, "Asia/Tokyo")).toBe("00:30");
    expect(formatWhen(iso, new Date("2026-11-17T20:00:00.000Z"), "Asia/Tokyo")).toBe("16/11 00:30");
  });

  it("hoje/ontem são decididos no fuso da empresa, não no UTC", () => {
    // 02:00Z de 16/11 ainda é 23:00 de 15/11 em São Paulo.
    const iso = "2026-11-16T02:00:00.000Z";
    expect(formatWhen(iso, new Date("2026-11-16T01:00:00.000Z"), "America/Sao_Paulo")).toBe("23:00");
    expect(formatListWhen(iso, new Date("2026-11-16T15:00:00.000Z"), "America/Sao_Paulo")).toBe("ontem");
    expect(formatListWhen("2026-11-10T12:00:00.000Z", new Date("2026-11-16T15:00:00.000Z"), "America/Sao_Paulo")).toBe("10/11");
  });

  it("sem offset a string é tratada como UTC e lixo vira vazio", () => {
    expect(zonedParts("2026-11-15 15:30:00", "UTC")).toMatchObject({ h: 15, mi: 30 });
    expect(formatWhen("lixo")).toBe("");
    expect(formatListWhen(null)).toBe("");
  });
});

describe("modo degradado (A2)", () => {
  it("só degraded ou source=fallback pedem aviso; template sozinho não", () => {
    expect(isDegraded("ai", false)).toBe(false);
    expect(isDegraded("template", false)).toBe(false);
    expect(isDegraded("template", true)).toBe(true);
    expect(isDegraded("fallback", undefined)).toBe(true);
    expect(degradedNotice("ai", false)).toBe("");
    expect(degradedNotice("fallback", false)).toMatch(/IA não respondeu/);
    expect(degradedNotice("template", true)).toMatch(/não conseguiu redigir/);
  });
});

describe("citações", () => {
  it("deduplica, rotula e descarta lixo", () => {
    const c = normalizeCitations([
      { source_type: "knowledge", source_id: "7", score: 0.9 },
      { source_type: "knowledge", source_id: "7", score: 0.8 },
      { source_type: "service", source_id: 3 },
      null,
      { source_id: "x" },
    ]);
    expect(c.map((x) => x.label)).toEqual(["Base de conhecimento", "Serviço"]);
    expect(c[0].score).toBe(0.9);
  });
});

describe("ações propostas", () => {
  it("guarda o confirm_token só na ação da mensagem, nunca na restaurada", () => {
    const p = normalizeProposedAction({ action_id: "a1", tool: "adjust_stock", summary: "Ajustar", risk: "low", params_preview: { quantity: 3 }, confirm_token: "TOKEN-123456", expires_at: "2026-11-15T12:00:00.000Z" });
    expect(p.token).toBe("TOKEN-123456");
    expect(normalizePendingAction({ action_id: "a1" }).token).toBe("");
  });

  it("token reemitido (A4): token novo, mesmo expires_at, sem params_preview", () => {
    const r = normalizeReissuedAction({ action_id: "a1", summary: " Cancelar ", expires_at: "2026-11-15T12:00:00.000Z", confirm_token: "NOVO", params_preview: null });
    expect(r).toEqual({ actionId: "a1", summary: "Cancelar", expiresAt: Date.parse("2026-11-15T12:00:00.000Z"), token: "NOVO" });
    expect(normalizeReissuedAction(null)).toMatchObject({ actionId: "", token: "", expiresAt: null });
  });

  it("params_preview vira linhas legíveis e esconde campos sensíveis", () => {
    const rows = previewRows({
      customer_name: "Ana", starts_at: "2026-11-16 10:00", price: 50, confirm_token: "x", company_id: 9, user_id: 1,
      nested: { service: "Corte", secret_key: "k" }, vazio: "", ok: true,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Cliente).toBe("Ana");
    expect(byLabel["Início"]).toBe("2026-11-16 10:00");
    expect(byLabel["Preço"]).toBe("50");
    expect(byLabel.Nested).toBe("Serviço: Corte");
    expect(byLabel.Ok).toBe("Sim");
    expect(JSON.stringify(rows)).not.toMatch(/confirm_token|company_id|user_id|secret/i);
    expect(previewRows(null)).toEqual([]);
  });

  it("rótulos de ferramenta e risco", () => {
    expect(toolLabel("cancel_appointment")).toBe("Cancelar agendamento");
    expect(toolLabel("drop_table")).toBe("Ação do assistente");
    expect(riskLabel("medium")).toBe("Risco médio");
  });
});

describe("expiração", () => {
  it("parseInstant aceita ISO e epoch; countdown e isExpired", () => {
    expect(parseInstant("2026-11-15T12:00:00.000Z")).toBe(Date.parse("2026-11-15T12:00:00.000Z"));
    expect(parseInstant(1700000000)).toBe(1700000000000);
    expect(parseInstant("lixo")).toBeNull();
    expect(formatCountdown(65000, 0)).toBe("1:05");
    expect(formatCountdown(0, 5000)).toBe("0:00");
    expect(isExpired(1000, 1000)).toBe(true);
    expect(isExpired(null, 1000)).toBe(false);
  });
});

describe("cota e plano", () => {
  it("usage da mensagem -> medidor", () => {
    expect(normalizeUsage({ interactions_used: 24, interactions_limit: 30 })).toMatchObject({ percent: 80, near: true, tone: "yellow", remaining: 6 });
    expect(normalizeUsage({ interactions_used: 30, interactions_limit: 30 })).toMatchObject({ exhausted: true, tone: "red" });
    expect(normalizeUsage({ interactions_used: 3, interactions_limit: 1000, period: "2026-11" })).toMatchObject({ limit: 1000, percent: 0, period: "2026-11" });
    expect(normalizeUsage(null)).toBeNull();
    expect(usageView(null, 30).known).toBe(false);
  });

  it("limite null = ilimitado (sem barra, sem aviso de limite)", () => {
    const u = normalizeUsage({ interactions_used: 12, interactions_limit: null });
    expect(u).toMatchObject({ used: 12, limit: null, unlimited: true, known: false, exhausted: false, near: false, tone: "green" });
  });

  it("GET /assistant/status -> estado e cota antes do primeiro envio (A1)", () => {
    const s = normalizeStatus({
      enabled: true, role: "admin", plan: { code: "premium", name: "Premium" },
      usage: { interactions_used: 7, interactions_limit: 1000, period: "2026-11" },
      ai_available: false, rag_enabled: true, actions: { enabled: true, reason: null, tools: ["create_appointment"] },
      read_tools: ["list_appointments"], knowledge_admin: true,
    });
    expect(s).toMatchObject({
      enabled: true, role: "admin", planCode: "premium", planName: "Premium", aiAvailable: false, ragEnabled: true,
      actionsEnabled: true, actionsReason: "", actionTools: ["create_appointment"], readTools: ["list_appointments"], knowledgeAdmin: true,
    });
    expect(s.usage).toMatchObject({ used: 7, limit: 1000, remaining: 993 });
  });

  it("status tolerante: tudo ausente não lança nem afirma nada", () => {
    const s = normalizeStatus(null);
    expect(s).toMatchObject({ enabled: false, aiAvailable: null, actionsEnabled: null, usage: null });
    expect(normalizeStatus({ enabled: true, actions: { enabled: false, reason: "plan" } })).toMatchObject({ actionsEnabled: false, actionsReason: "plan" });
  });

  it("motivos de ações desativadas", () => {
    expect(actionsReasonLabel("plan")).toMatch(/somente para consultas/);
    expect(actionsReasonLabel("not_configured")).toMatch(/servidor/);
    expect(actionsReasonLabel("outro")).toBe("");
  });

  it("rótulo da cota do assistente no convite de upgrade", () => {
    const info = planUpgradeInfo(err(402, { code: "plan_upgrade_required", message: "m", plan: "free", quota: "assistant_monthly_interactions", limit: 30, used: 30 }));
    expect(describeQuota(info)).toMatch(/30 interações do assistente por mês/);
  });
});

describe("classifyAssistantError", () => {
  it.each([
    [503, { code: "assistant_disabled" }, "disabled"],
    [503, { code: "assistant_actions_disabled" }, "actions_disabled"],
    [429, { code: "assistant_budget_exceeded" }, "budget"],
    [403, { code: "assistant_forbidden", message: "só admin" }, "forbidden"],
    [403, { code: "invalid_confirm_token" }, "invalid_token"],
    [403, { code: "admin_required" }, "admin_required"],
    [404, { code: "conversation_not_found" }, "not_found"],
    [404, { code: "action_not_found" }, "not_found"],
    [409, { code: "action_already_processed" }, "processed"],
    [410, { code: "action_expired" }, "expired"],
    [422, { code: "action_failed", message: "Horário ocupado." }, "failed"],
  ])("%i %j -> %s", (status, body, kind) => {
    expect(classifyAssistantError(err(status, body)).kind).toBe(kind);
  });

  it("402 de cota vs. de recurso (Free)", () => {
    const q = classifyAssistantError(err(402, { code: "plan_upgrade_required", quota: "assistant_monthly_interactions", limit: 30, used: 30, plan: "free" }));
    expect(q).toMatchObject({ kind: "upgrade", reason: "quota", limit: 30, used: 30, accepted: false });
    const f = classifyAssistantError(err(402, { code: "plan_upgrade_required", feature: "assistant_actions", plan: "free" }));
    // A7: proposta negada não grava a pergunta nem consome cota.
    expect(f).toMatchObject({ kind: "upgrade", reason: "feature", accepted: false });
    expect(classifyAssistantError(err(503, { code: "assistant_actions_disabled" }))).toMatchObject({ kind: "actions_disabled", accepted: false });
  });

  it("404 diferencia conversa de ação; 403 admin_required não é sessão expirada", () => {
    expect(classifyAssistantError(err(404, { code: "conversation_not_found" })).what).toBe("conversation");
    expect(classifyAssistantError(err(404, { code: "action_not_found" })).what).toBe("action");
    expect(classifyAssistantError(err(403, { code: "admin_required" }))).toMatchObject({ kind: "admin_required", message: expect.stringMatching(/administradores/) });
  });

  it("429 rate_limited usa retry_after do corpo (CORS não expõe o header) com teto", () => {
    expect(classifyAssistantError(err(429, { code: "rate_limited", retry_after: 17 }))).toMatchObject({ kind: "rate_limited", retryAfter: 17 });
    expect(retryAfterSeconds(err(429, { code: "rate_limited" }, { headers: { "retry-after": "9" } }))).toBe(9);
    expect(retryAfterSeconds(err(429, { code: "rate_limited" }))).toBe(30);
    expect(retryAfterSeconds(err(429, { code: "rate_limited", retry_after: 99999 }))).toBe(300);
  });

  it("timeout, rede e 5xx: resultado incerto (nunca reenviar sozinho)", () => {
    const timeout = Object.assign(new Error("timeout of 45000ms exceeded"), { code: "ECONNABORTED" });
    expect(classifyAssistantError(timeout)).toMatchObject({ kind: "timeout", outcomeUnknown: true, accepted: null });
    expect(classifyAssistantError(new Error("Network Error"))).toMatchObject({ kind: "network", outcomeUnknown: true });
    expect(classifyAssistantError(err(503, undefined))).toMatchObject({ kind: "unavailable", outcomeUnknown: true });
    expect(classifyAssistantError(err(502, undefined)).outcomeUnknown).toBe(true);
    expect(classifyAssistantError(err(500, { code: "internal_error" }))).toMatchObject({ kind: "server", outcomeUnknown: true });
  });

  it("503 sem código não é 'assistente desligado' (dyno dormindo)", () => {
    expect(classifyAssistantError(err(503, undefined)).kind).not.toBe("disabled");
  });
});

describe("base de conhecimento", () => {
  it("valida o corpo completo (tipo, título <=160, conteúdo <=4000)", () => {
    expect(validateKnowledgeForm({ kind: "faq", title: " ", content: "x" }).errors.title).toBeTruthy();
    expect(validateKnowledgeForm({ kind: "xx", title: "t", content: "c" }).errors.kind).toBeTruthy();
    expect(validateKnowledgeForm({ kind: "faq", title: "t".repeat(161), content: "c" }).ok).toBe(false);
    expect(validateKnowledgeForm({ kind: "faq", title: "t", content: "c".repeat(4001) }).ok).toBe(false);
    expect(validateKnowledgeForm({ kind: "policy", title: " Troca ", content: " texto " })).toMatchObject({ ok: true, payload: { kind: "policy", title: "Troca", content: "texto" } });
  });

  it("lista como array ou { items }", () => {
    expect(normalizeKnowledgeList([{ id: 1, kind: "faq", title: "a", content: "b" }])).toHaveLength(1);
    expect(normalizeKnowledgeList({ items: [{ id: 2 }] })[0].id).toBe(2);
    expect(normalizeKnowledgeList(null)).toEqual([]);
  });

  it("item tem active (padrão: ativo) e o formulário o carrega", () => {
    expect(normalizeKnowledgeItem({ id: 1 }).active).toBe(true);
    expect(normalizeKnowledgeItem({ id: 1, active: false }).active).toBe(false);
    expect(normalizeKnowledgeItem({ id: 1, active: 0 }).active).toBe(false);
    expect(emptyKnowledgeForm().active).toBe(true);
    expect(knowledgeFormFromItem({ id: 1, kind: "faq", title: "t", content: "c", active: false }).active).toBe(false);
    expect(validateKnowledgeForm({ kind: "faq", title: "t", content: "c", active: false }).payload.active).toBe(false);
  });

  it("PATCH parcial: só os campos que mudaram", () => {
    const item = { id: 1, kind: "faq", title: "Horário", content: "9h às 18h", active: true };
    expect(knowledgePatch(item, { kind: "faq", title: "Horário", content: "9h às 18h", active: true })).toEqual({});
    expect(knowledgePatch(item, { active: false })).toEqual({ active: false });
    expect(knowledgePatch(item, { kind: "policy", title: "Horário", content: "10h", active: true })).toEqual({ kind: "policy", content: "10h" });
    expect(knowledgePatch({ ...item, active: false }, { active: true })).toEqual({ active: true });
  });

  it("erros com código (A5): admin_required, knowledge_not_found, limite e validation_error por campo", () => {
    expect(classifyKnowledgeError(err(403, { code: "admin_required", message: "x" }))).toMatchObject({ kind: "forbidden", message: expect.stringMatching(/Apenas administradores/) });
    expect(classifyKnowledgeError(err(404, { code: "knowledge_not_found", message: "x" })).kind).toBe("not_found");
    expect(classifyKnowledgeError(err(409, { code: "knowledge_limit_reached", message: "Limite.", limit: 500 }))).toMatchObject({ kind: "limit", limit: 500, message: "Limite." });
    const v = classifyKnowledgeError(err(400, {
      code: "validation_error", message: "Dados inválidos.",
      fields: [{ field: "title", message: "Título é obrigatório." }, { field: "outro", message: "x" }],
    }));
    expect(v).toMatchObject({ kind: "validation", message: "Dados inválidos.", fields: { title: "Título é obrigatório." }, hasFieldErrors: true });
    // errors[] legado no corpo (sem error.fields) também mapeia o campo.
    const legacy = new axios.AxiosError("x", "E", {}, {}, { status: 400, data: { errors: [{ field: "content", message: "Conteúdo vazio." }] }, headers: {} });
    expect(classifyKnowledgeError(legacy)).toMatchObject({ kind: "validation", fields: { content: "Conteúdo vazio." } });
  });

  it("401 é sessão (não 'sem permissão'); rede e assistente desligado", () => {
    const plain = (status, message) => new axios.AxiosError("x", "E", {}, {}, { status, data: { message }, headers: {} });
    expect(classifyKnowledgeError(plain(401, "Acesso negado")).kind).toBe("unauthorized");
    expect(classifyKnowledgeError(plain(403, "x")).kind).toBe("forbidden");
    expect(classifyKnowledgeError(plain(400, "\"title\" is required"))).toMatchObject({ kind: "validation", message: "\"title\" is required" });
    expect(classifyKnowledgeError(plain(404, "x")).kind).toBe("not_found");
    expect(classifyKnowledgeError(new Error("Network Error")).kind).toBe("network");
    expect(classifyKnowledgeError(err(503, { code: "assistant_disabled" })).kind).toBe("disabled");
  });
});

describe("linkOptions", () => {
  it("usa allowlist configurável e sempre permite caminho interno", () => {
    expect(linkOptions({ allowedHosts: "a.com, B.com" })).toEqual({ allowedHosts: ["a.com", "b.com"], allowRelative: true, allowLocalHttp: false });
    expect(linkOptions().allowedHosts).toEqual(["agendaspro.com.br"]);
  });
});
