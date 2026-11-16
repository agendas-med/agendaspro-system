import { describe, it, expect } from "vitest";
import axios from "axios";
import {
  MAX_MESSAGE_LENGTH, validateMessage, normalizeConversations, normalizeConversationDetail, normalizeCitations,
  normalizeProposedAction, normalizePendingAction, previewRows, normalizeUsage, usageView, planFromSubscription,
  classifyAssistantError, classifyKnowledgeError, retryAfterSeconds, parseInstant, formatCountdown, isExpired,
  validateKnowledgeForm, normalizeKnowledgeList, toolLabel, riskLabel, linkOptions, formatWhen, sourceLabel,
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
    expect(sourceLabel("fallback")).toMatch(/IA não respondeu/);
    expect(sourceLabel("user")).toBe("");
  });

  it("created_at do core (wall+3h com Z) volta para a hora de parede", () => {
    const now = new Date(2026, 10, 15, 12, 0);
    expect(formatWhen("2026-11-15T12:30:00.000Z", now)).toBe("09:30");
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
    expect(normalizeUsage({ interactions_used: 3 }, 1000)).toMatchObject({ limit: 1000, percent: 0 });
    expect(normalizeUsage(null, null)).toBeNull();
    expect(usageView(null, 30).known).toBe(false);
  });

  it("plano a partir de /billing/subscription (tolerante)", () => {
    expect(planFromSubscription({ entitlement: { plan_code: "free", features: { assistant_monthly_interactions: 30, assistant_actions: false } } }))
      .toMatchObject({ planCode: "free", monthlyLimit: 30, actionsEnabled: false });
    expect(planFromSubscription({})).toMatchObject({ monthlyLimit: null, actionsEnabled: null });
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
    [404, { code: "conversation_not_found" }, "not_found"],
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
    expect(f).toMatchObject({ kind: "upgrade", reason: "feature" });
    expect(f.accepted).not.toBe(false);
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

  it("erros sem código: só o status discrimina; 401/403 = sem permissão", () => {
    const plain = (status, message) => new axios.AxiosError("x", "E", {}, {}, { status, data: { message }, headers: {} });
    expect(classifyKnowledgeError(plain(401, "Acesso negado")).kind).toBe("forbidden");
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
