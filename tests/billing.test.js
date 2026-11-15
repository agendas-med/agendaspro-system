import { describe, it, expect } from "vitest";
import {
  safeExternalUrl, hasPendingPayment, commissionsParams, currentMonthRange, validatePeriod,
  sortPlans, invoiceStatus, commissionStatus, entitlementSourceLabel, PLAN_MATRIX,
} from "../utils/billing.js";

describe("billing", () => {
  it("só abre links http(s)", () => {
    expect(safeExternalUrl("https://pagamento.exemplo.test/i/1")).toBe("https://pagamento.exemplo.test/i/1");
    expect(safeExternalUrl("javascript:alert(1)")).toBe("");
    expect(safeExternalUrl("data:text/html,x")).toBe("");
    expect(safeExternalUrl(null)).toBe("");
  });
  it("detecta fatura pendente", () => {
    expect(hasPendingPayment({ pending_invoice_url: "https://x.test/i" })).toBe(true);
    expect(hasPendingPayment({ pending_invoice_url: null })).toBe(false);
    expect(hasPendingPayment(null)).toBe(false);
  });
  it("extrato omite from/to vazios", () => {
    expect(commissionsParams({ from: "", to: "" })).toEqual({});
    expect(commissionsParams({ from: "2027-03-01", to: "2027-03-31" })).toEqual({ from: "2027-03-01", to: "2027-03-31" });
  });
  it("período padrão é o mês corrente e valida a ordem", () => {
    expect(currentMonthRange(new Date(2028, 1, 10))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(validatePeriod({ from: "2027-03-31", to: "2027-03-01" })).toMatch(/inicial/);
    expect(validatePeriod({ from: "2027-03-01", to: "" })).toBe("");
  });
  it("ordena planos e rotula status", () => {
    expect(sortPlans([{ code: "premium", sort_order: 2, price_cents: 4990 }, { code: "free", sort_order: 1, price_cents: 0 }]).map((p) => p.code)).toEqual(["free", "premium"]);
    expect(invoiceStatus("overdue").label).toBe("Vencida");
    expect(invoiceStatus("zzz").label).toBe("zzz");
    expect(commissionStatus("settled").tone).toBe("green");
    expect(entitlementSourceLabel("grace")).toMatch(/atraso/);
  });
  it("matriz marca recursos futuros e traz o limite de profissionais", () => {
    expect(PLAN_MATRIX.find((r) => r.key === "professionals")).toMatchObject({ free: "1" });
    expect(PLAN_MATRIX.some((r) => r.soon)).toBe(true);
  });
});
