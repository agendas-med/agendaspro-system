import { describe, it, expect } from "vitest";
import { decideAccess, resolveAccess, needsSession, isAdminUser } from "../utils/access.js";
import { buildCsp, inlineScriptHashes, buildHeadersFile, BASE_HEADERS } from "../config/securityHeaders.mjs";

const ok = { status: "ok" };

describe("guard de rotas", () => {
  it("padrão é member", () => {
    expect(resolveAccess(undefined)).toBe("member");
    expect(resolveAccess({ access: "qualquer" })).toBe("member");
    expect(resolveAccess({ access: "admin" })).toBe("admin");
  });

  it("deslogado vai para /entrar em rota protegida", () => {
    expect(decideAccess({ access: "member", hasToken: false })).toEqual({ redirect: "/entrar" });
    expect(decideAccess({ access: "admin", hasToken: false })).toEqual({ redirect: "/entrar" });
    expect(decideAccess({ access: "user", hasToken: false })).toEqual({ redirect: "/entrar" });
  });

  it("rotas públicas sempre passam", () => {
    expect(decideAccess({ access: "public", hasToken: false })).toEqual({ allow: true });
    expect(decideAccess({ access: "public", hasToken: true, session: ok })).toEqual({ allow: true });
  });

  it("guest logado vai para a agenda; sem empresa, para criar empresa", () => {
    expect(decideAccess({ access: "guest", hasToken: true, session: ok })).toEqual({ redirect: "/agenda" });
    expect(decideAccess({ access: "guest", hasToken: true, session: { status: "no-company" } }))
      .toEqual({ redirect: "/criar-empresa" });
    expect(decideAccess({ access: "guest", hasToken: false })).toEqual({ allow: true });
    expect(decideAccess({ access: "guest", hasToken: true, session: { status: "unauthenticated" } }))
      .toEqual({ allow: true });
  });

  it("sessão expirada ou sem empresa redireciona", () => {
    expect(decideAccess({ access: "member", hasToken: true, session: { status: "unauthenticated" } }))
      .toEqual({ redirect: "/entrar" });
    expect(decideAccess({ access: "member", hasToken: true, session: { status: "no-company" } }))
      .toEqual({ redirect: "/criar-empresa" });
    expect(decideAccess({ access: "member", hasToken: true, session: { status: "error" } }))
      .toEqual({ allow: true });
  });

  it("admin exige permission == 1", () => {
    expect(decideAccess({ access: "admin", hasToken: true, session: ok, user: { permission: 0 } }))
      .toEqual({ redirect: "/acesso-negado" });
    expect(decideAccess({ access: "admin", hasToken: true, session: ok, user: { permission: 1 } }))
      .toEqual({ allow: true });
    expect(isAdminUser(null)).toBe(false);
  });

  it("só consulta a API quando necessário", () => {
    expect(needsSession("public", true)).toBe(false);
    expect(needsSession("member", false)).toBe(false);
    expect(needsSession("member", true)).toBe(true);
  });
});

describe("cabeçalhos de segurança", () => {
  it("base restritiva", () => {
    expect(BASE_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(BASE_HEADERS["Referrer-Policy"]).toBeTruthy();
    expect(BASE_HEADERS["Permissions-Policy"]).toBeTruthy();
  });

  it("CSP libera só a API configurada e não usa unsafe-eval", () => {
    const csp = buildCsp({ apiBase: "https://api.exemplo.com.br/v1", scriptHashes: ["'sha256-abc='"] });
    expect(csp).toContain("https://api.exemplo.com.br");
    expect(csp).toContain("'sha256-abc='");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("calcula hashes dos scripts inline e gera _headers", () => {
    const hashes = inlineScriptHashes("<html><script>window.a=1</script><script src=\"/x.js\"></script></html>");
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-.+='$/);
    const file = buildHeadersFile({ csp: "default-src 'self'" });
    expect(file).toContain("/*");
    expect(file).toContain("Content-Security-Policy: default-src 'self'");
  });
});
