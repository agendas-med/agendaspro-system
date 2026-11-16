import { describe, it, expect } from "vitest";
import {
  redirectUriFor, safeAuthorizeUrl, cleanAuthCode, parseOauthCallback, savePending, readPending, clearPending, checkPending,
  PENDING_MAX_AGE_MS,
} from "../utils/oauth.js";

function memStorage() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } };
}

describe("redirectUriFor", () => {
  it("origem + rota do callback, sem barra dupla", () => {
    expect(redirectUriFor("instagram", "https://app.agendaspro.com/")).toBe("https://app.agendaspro.com/oauth/instagram");
    expect(redirectUriFor("google", "http://localhost:8080")).toBe("http://localhost:8080/oauth/google-agenda");
    expect(redirectUriFor("nada", "https://x")).toBe("");
    expect(redirectUriFor("instagram", "")).toBe("");
  });
});

describe("safeAuthorizeUrl", () => {
  it("aceita só https do domínio do provedor", () => {
    expect(safeAuthorizeUrl("instagram", "https://www.instagram.com/oauth/authorize?client_id=1")).not.toBe("");
    expect(safeAuthorizeUrl("google", "https://accounts.google.com/o/oauth2/v2/auth?x=1")).not.toBe("");
    expect(safeAuthorizeUrl("instagram", "https://evil.example.com/oauth/authorize")).toBe("");
    expect(safeAuthorizeUrl("instagram", "https://instagram.com.evil.com/x")).toBe("");
    expect(safeAuthorizeUrl("instagram", "javascript:alert(1)")).toBe("");
    expect(safeAuthorizeUrl("google", "http://accounts.google.com/x")).toBe("");
    expect(safeAuthorizeUrl("outro", "https://www.instagram.com/x")).toBe("");
  });
  it("http local só com allowLocal (mock de desenvolvimento)", () => {
    expect(safeAuthorizeUrl("instagram", "http://localhost:3001/mock/ig")).toBe("");
    expect(safeAuthorizeUrl("instagram", "http://localhost:3001/mock/ig", { allowLocal: true })).not.toBe("");
    expect(safeAuthorizeUrl("instagram", "http://evil.com/x", { allowLocal: true })).toBe("");
  });
});

describe("parseOauthCallback", () => {
  it("sem parâmetros: none", () => {
    expect(parseOauthCallback({})).toEqual({ kind: "none" });
    expect(parseOauthCallback(null)).toEqual({ kind: "none" });
  });
  it("code + state, removendo #_ do fim", () => {
    expect(parseOauthCallback({ code: "AQD123#_", state: "s.1" })).toEqual({ kind: "code", code: "AQD123", state: "s.1" });
    expect(cleanAuthCode(" abc#_ ")).toBe("abc");
  });
  it("cancelamento pelo usuário e erro do provedor não expõem texto da URL", () => {
    const denied = parseOauthCallback({ error: "access_denied", error_description: "<script>x</script>" });
    expect(denied.kind).toBe("denied");
    expect(denied.reason).not.toContain("script");
    expect(parseOauthCallback({ error_reason: "user_denied", error: "access_denied" }).kind).toBe("denied");
    expect(parseOauthCallback({ error: "server_error" }).kind).toBe("error");
  });
  it("retorno incompleto ou gigante é erro", () => {
    expect(parseOauthCallback({ code: "x" }).kind).toBe("error");
    expect(parseOauthCallback({ state: "x" }).kind).toBe("error");
    expect(parseOauthCallback({ code: "a".repeat(3000), state: "s" }).kind).toBe("error");
  });
  it("aceita valores em array (query repetida)", () => {
    expect(parseOauthCallback({ code: ["c1", "c2"], state: ["s1"] })).toEqual({ kind: "code", code: "c1", state: "s1" });
  });
});

describe("estado pendente", () => {
  it("salva, lê e limpa", () => {
    const s = memStorage();
    savePending(s, "instagram", { state: "abc", companyId: 7, now: 1000 });
    expect(readPending(s, "instagram")).toEqual({ state: "abc", companyId: "7", at: 1000 });
    expect(readPending(s, "google")).toBeNull();
    clearPending(s, "instagram");
    expect(readPending(s, "instagram")).toBeNull();
  });
  it("storage nulo ou corrompido não quebra", () => {
    expect(readPending(null, "instagram")).toBeNull();
    const s = memStorage();
    s.setItem("agendaspro_oauth_instagram", "{lixo");
    expect(readPending(s, "instagram")).toBeNull();
  });
  it("checkPending: sem pedido guardado deixa o core decidir; state, validade e empresa são conferidos", () => {
    expect(checkPending(null, { state: "a" })).toEqual({ ok: true, known: false });
    const p = { state: "abc", companyId: "7", at: 1000 };
    expect(checkPending(p, { state: "abc", companyId: "7", now: 2000 })).toEqual({ ok: true, known: true });
    expect(checkPending(p, { state: "zzz", now: 2000 }).ok).toBe(false);
    expect(checkPending(p, { state: "abc", now: 1000 + PENDING_MAX_AGE_MS + 1 }).ok).toBe(false);
    expect(checkPending(p, { state: "abc", companyId: "9", now: 2000 }).ok).toBe(false);
  });
});
