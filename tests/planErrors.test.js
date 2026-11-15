import { describe, it, expect } from "vitest";
import {
  isPlanUpgradeError, isBillingDisabledError, planUpgradeInfo, describeQuota, quotaLabel,
  isAlreadyHandled, emptyUpgradePrompt,
} from "../utils/planErrors.js";

const err = (status, data) => ({ response: { status, data } });
const upgrade = err(402, {
  error: { code: "plan_upgrade_required", message: "Limite atingido.", plan: "free", quota: "max_professionals", limit: 1, used: 1 },
});

describe("402 plan_upgrade_required", () => {
  it("reconhece pelo status e pelo code", () => {
    expect(isPlanUpgradeError(upgrade)).toBe(true);
    expect(isPlanUpgradeError(err(402, { message: "outro" }))).toBe(false);
    expect(isPlanUpgradeError(err(402, { error: { code: "x" } }))).toBe(false);
    expect(isPlanUpgradeError(err(400, upgrade.response.data))).toBe(false);
    expect(isPlanUpgradeError(null)).toBe(false);
  });
  it("normaliza quota/limit/usage", () => {
    expect(planUpgradeInfo(upgrade)).toEqual({
      message: "Limite atingido.", plan: "free", planName: "Free",
      quota: "max_professionals", feature: "", limit: 1, used: 1,
    });
  });
  it("mensagem padrão e campos ausentes", () => {
    const info = planUpgradeInfo(err(402, { error: { code: "plan_upgrade_required", feature: "whatsapp_reminder_2h" } }));
    expect(info.message).toMatch(/plano/i);
    expect(info.limit).toBeNull();
    expect(info.feature).toBe("whatsapp_reminder_2h");
  });
  it("descreve a cota", () => {
    expect(describeQuota(planUpgradeInfo(upgrade))).toBe("Plano Free: limite de 1 profissionais (em uso: 1)");
    expect(describeQuota(planUpgradeInfo(err(402, { error: { code: "plan_upgrade_required" } })))).toBe("");
    expect(quotaLabel("max_team_users")).toBe("usuários da equipe");
  });
});

describe("503 billing_disabled", () => {
  it("só com o code (503 comum é serviço fora do ar)", () => {
    expect(isBillingDisabledError(err(503, { error: { code: "billing_disabled", message: "x" } }))).toBe(true);
    expect(isBillingDisabledError(err(503, "<html>"))).toBe(false);
    expect(isBillingDisabledError(err(503, { error: { code: "other" } }))).toBe(false);
    expect(isBillingDisabledError(err(402, { error: { code: "billing_disabled" } }))).toBe(false);
  });
});

describe("aviso duplicado", () => {
  it("ignora a mesma mensagem dentro da janela", () => {
    const handled = { at: 1000, message: "Limite atingido." };
    expect(isAlreadyHandled(handled, "Limite atingido.", 2000)).toBe(true);
    expect(isAlreadyHandled(handled, "Outra", 2000)).toBe(false);
    expect(isAlreadyHandled(handled, "Limite atingido.", 1000 + 6000)).toBe(false);
    expect(isAlreadyHandled({ at: 0, message: "" }, "", 10)).toBe(false);
  });
  it("estado inicial do prompt", () => {
    expect(emptyUpgradePrompt()).toEqual({ show: false, info: null });
  });
});
