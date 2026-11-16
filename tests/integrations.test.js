import { describe, it, expect } from "vitest";
import {
  safeHttpsUrl, classifyIntegrationError, blockFromError, blockState, relativeTime, formatRetryAt, formatShortDate, daysUntil,
  ADMIN_ONLY_MESSAGE,
} from "../utils/integrations.js";

const http = (status, error, extra = {}) => ({ response: { status, data: { error } }, ...extra });

describe("safeHttpsUrl", () => {
  it("aceita https e rejeita javascript:, data:, http e credenciais", () => {
    expect(safeHttpsUrl("https://www.instagram.com/p/abc/")).toBe("https://www.instagram.com/p/abc/");
    expect(safeHttpsUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpsUrl("data:text/html,<b>x</b>")).toBe("");
    expect(safeHttpsUrl("http://example.com")).toBe("");
    expect(safeHttpsUrl("https://user:pw@example.com")).toBe("");
    expect(safeHttpsUrl("")).toBe("");
    expect(safeHttpsUrl(null)).toBe("");
  });
  it("http só em localhost quando permitido", () => {
    expect(safeHttpsUrl("http://localhost:3001/x", { allowLocalHttp: true })).toContain("localhost");
    expect(safeHttpsUrl("http://evil.com/x", { allowLocalHttp: true })).toBe("");
    expect(safeHttpsUrl("http://localhost:3001/x")).toBe("");
  });
});

describe("classifyIntegrationError", () => {
  it("rede e timeout", () => {
    expect(classifyIntegrationError({ code: "ERR_NETWORK", message: "Network Error" }).kind).toBe("network");
    expect(classifyIntegrationError({ code: "ECONNABORTED", message: "timeout of 15000ms" }).kind).toBe("timeout");
  });
  it("402 vira upgrade com a feature e preserva handledGlobally", () => {
    const c = classifyIntegrationError(http(402, { code: "plan_upgrade_required", feature: "instagram", plan: "free", message: "Só no Premium." }, { handledGlobally: true }));
    expect(c).toMatchObject({ kind: "upgrade", feature: "instagram", plan: "free", message: "Só no Premium.", handledGlobally: true });
  });
  it("403 admin_required e 403 genérico", () => {
    expect(classifyIntegrationError(http(403, { code: "admin_required" }))).toMatchObject({ kind: "admin_required", message: ADMIN_ONLY_MESSAGE });
    expect(classifyIntegrationError(http(403, { code: "x", message: "Negado." })).kind).toBe("forbidden");
  });
  it("409 reauth_required (Instagram e Google) e 409 de conflito", () => {
    expect(classifyIntegrationError(http(409, { code: "instagram_reauth_required" }), { provider: "instagram" }).kind).toBe("reauth_required");
    expect(classifyIntegrationError(http(409, { code: "google_calendar_reauth_required" }), { provider: "google" })).toMatchObject({ kind: "reauth_required" });
    expect(classifyIntegrationError(http(409, { code: "calendar_link_conflict", message: "Destino duplicado." }))).toMatchObject({ kind: "conflict", message: "Destino duplicado." });
  });
  it("429 mostra o horário de retry_at quando houver", () => {
    const iso = new Date(2026, 10, 16, 14, 30).toISOString();
    const now = new Date(2026, 10, 16, 12, 0).getTime();
    const c = classifyIntegrationError(http(429, { code: "instagram_rate_limited", retry_at: iso }), { now });
    expect(c.kind).toBe("rate_limited");
    expect(c.message).toContain("14:30");
    expect(classifyIntegrationError(http(429, { code: "rate_limited" })).message).toContain("limite de sincronizações");
  });
  it("503 integration_not_configured, 404 not_connected, 404 calendar_not_found", () => {
    expect(classifyIntegrationError(http(503, { code: "integration_not_configured" })).kind).toBe("not_configured");
    expect(classifyIntegrationError(http(404, { code: "integration_not_connected" })).kind).toBe("not_connected");
    expect(classifyIntegrationError(http(404, { code: "calendar_not_found" })).kind).toBe("not_found");
  });
  it("400 de OAuth", () => {
    expect(classifyIntegrationError(http(400, { code: "oauth_state_invalid" })).kind).toBe("oauth_state_invalid");
    expect(classifyIntegrationError(http(400, { code: "redirect_uri_not_allowed" })).kind).toBe("redirect_not_allowed");
    expect(classifyIntegrationError({ response: { status: 400, data: { errors: [{ message: "x" }] } } }).kind).toBe("validation");
  });
  it("502 oauth_failed com no_refresh_token explica o que fazer; 502 unavailable é retentável", () => {
    const c = classifyIntegrationError(http(502, { code: "google_calendar_oauth_failed", provider_code: "no_refresh_token" }), { provider: "google" });
    expect(c.kind).toBe("oauth_failed");
    expect(c.message).toContain("myaccount.google.com");
    const u = classifyIntegrationError(http(502, { code: "instagram_unavailable" }));
    expect(u).toMatchObject({ kind: "unavailable", retryable: true });
  });
  it("500 sem código vira server", () => {
    expect(classifyIntegrationError({ response: { status: 500, data: "<html>" } }).kind).toBe("server");
  });
});

describe("blocos", () => {
  it("402 vira locked e os demais erros viram error", () => {
    const up = blockFromError({ kind: "upgrade", message: "m", feature: "instagram" });
    expect(up).toMatchObject({ status: "locked", feature: "instagram" });
    expect(blockFromError({ kind: "network", message: "x" }).status).toBe("error");
    expect(blockState().status).toBe("idle");
  });
});

describe("tempo", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("relativeTime", () => {
    expect(relativeTime("2026-11-16T11:59:40Z", now)).toBe("agora");
    expect(relativeTime("2026-11-16T11:55:00Z", now)).toBe("há 5 min");
    expect(relativeTime("2026-11-16T09:00:00Z", now)).toBe("há 3 h");
    expect(relativeTime("2026-11-14T12:00:00Z", now)).toBe("há 2 dias");
    expect(relativeTime("lixo", now)).toBe("");
  });
  it("formatShortDate, formatRetryAt e daysUntil", () => {
    expect(formatShortDate("2026-11-05")).toBe("05/11");
    expect(formatShortDate("x")).toBe("");
    expect(formatRetryAt("nope")).toBe("");
    expect(daysUntil("2026-11-26T12:00:00Z", now)).toBe(10);
    expect(daysUntil("x", now)).toBeNull();
  });
});
