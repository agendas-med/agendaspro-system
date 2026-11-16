import { describe, it, expect } from "vitest";
import { cleanText, safeHref, isExternalHref, parseSafeText, plainText } from "../utils/safeText.js";

const OPTS = { allowedHosts: ["agendaspro.com.br"], allowRelative: true };
const ch = (n) => String.fromCharCode(n);

describe("cleanText", () => {
  it("remove controles e caracteres bidi/largura zero, mantém \\n e \\t", () => {
    const dirty = `a${ch(0)}b${ch(0x202e)}c${ch(0x200b)}d${ch(0xfeff)}e\n\tf${ch(0x7f)}`;
    expect(cleanText(dirty)).toBe("abcde\n\tf");
  });
  it("normaliza CRLF e limita o tamanho", () => {
    expect(cleanText("a\r\nb\rc")).toBe("a\nb\nc");
    expect(cleanText("x".repeat(5000)).length).toBe(4000);
    expect(cleanText(null)).toBe("");
  });
});

describe("safeHref", () => {
  it("aceita https na allowlist (e subdomínio) e caminho interno", () => {
    expect(safeHref("https://agendaspro.com.br/planos", OPTS)).toBe("https://agendaspro.com.br/planos");
    expect(safeHref("https://app.agendaspro.com.br/x", OPTS)).toBe("https://app.agendaspro.com.br/x");
    expect(safeHref("/agenda", OPTS)).toBe("/agenda");
  });
  it("recusa host fora da allowlist, host parecido e credenciais", () => {
    expect(safeHref("https://evil.com", OPTS)).toBeNull();
    expect(safeHref("https://agendaspro.com.br.evil.com", OPTS)).toBeNull();
    expect(safeHref("https://notagendaspro.com.br", OPTS)).toBeNull();
    expect(safeHref("https://user:pw@agendaspro.com.br", OPTS)).toBeNull();
  });
  it("recusa javascript:, data:, http:, protocolo relativo e barra invertida", () => {
    expect(safeHref("javascript:alert(1)", OPTS)).toBeNull();
    expect(safeHref("data:text/html;base64,AAAA", OPTS)).toBeNull();
    expect(safeHref("http://agendaspro.com.br", OPTS)).toBeNull();
    expect(safeHref("//evil.com", OPTS)).toBeNull();
    expect(safeHref("/\\evil.com", OPTS)).toBeNull();
    expect(safeHref("/ok path", OPTS)).toBeNull();
    expect(safeHref(`/a${ch(10)}b`, OPTS)).toBeNull();
    expect(safeHref("", OPTS)).toBeNull();
  });
  it("caminho interno só com allowRelative; http só em localhost com allowLocalHttp", () => {
    expect(safeHref("/agenda", { allowRelative: false })).toBeNull();
    expect(safeHref("http://localhost:3000/x", OPTS)).toBeNull();
    expect(safeHref("http://localhost:3000/x", { ...OPTS, allowLocalHttp: true })).toBe("http://localhost:3000/x");
    expect(safeHref("http://evil.com", { ...OPTS, allowLocalHttp: true })).toBeNull();
  });
  it("mailto simples sim; com parâmetros não", () => {
    expect(safeHref("mailto:contato@agendaspro.com.br", OPTS)).toBe("mailto:contato@agendaspro.com.br");
    expect(safeHref("mailto:a@b.com?subject=x", OPTS)).toBeNull();
  });
});

describe("isExternalHref", () => {
  it("interno e domínio próprio não são externos", () => {
    expect(isExternalHref("/agenda", ["agendaspro.com.br"])).toBe(false);
    expect(isExternalHref("https://app.agendaspro.com.br/x", ["agendaspro.com.br"])).toBe(false);
    expect(isExternalHref("https://outro.com", ["agendaspro.com.br"])).toBe(true);
  });
});

describe("parseSafeText", () => {
  it("HTML vira texto puro (nunca marcação)", () => {
    const blocks = parseSafeText("<img src=x onerror=alert(1)><script>x</script>", OPTS);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].inline).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)><script>x</script>" }]);
  });
  it("negrito, parágrafos, quebra de linha e listas", () => {
    const blocks = parseSafeText("Olá **você**\nlinha 2\n\n- um\n- dois\n\n1. três", OPTS);
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "ul"]);
    expect(blocks[0].inline.map((n) => n.t)).toEqual(["text", "strong", "br", "text"]);
    expect(blocks[1].items).toHaveLength(2);
    expect(blocks[2].items[0][0].v).toBe("três");
  });
  it("link markdown válido vira link; inválido vira só o rótulo", () => {
    const ok = parseSafeText("[ver](/agenda)", OPTS)[0].inline[0];
    expect(ok).toEqual({ t: "link", v: "ver", href: "/agenda" });
    const bad = parseSafeText("[clique](javascript:alert(1))", OPTS)[0].inline;
    expect(bad.some((n) => n.t === "link")).toBe(false);
    expect(bad[0]).toEqual({ t: "text", v: "clique" });
  });
  it("URL solta: remove pontuação final do link e recusa host não permitido", () => {
    const n = parseSafeText("veja https://agendaspro.com.br/planos.", OPTS)[0].inline;
    expect(n[1]).toEqual({ t: "link", v: "https://agendaspro.com.br/planos", href: "https://agendaspro.com.br/planos" });
    expect(n[2]).toEqual({ t: "text", v: "." });
    const bad = parseSafeText("https://evil.com/x", OPTS)[0].inline;
    expect(bad.some((x) => x.t === "link")).toBe(false);
  });
  it("texto vazio gera zero blocos", () => {
    expect(parseSafeText("", OPTS)).toEqual([]);
    expect(parseSafeText(null, OPTS)).toEqual([]);
  });
});

describe("plainText", () => {
  it("achata para texto sem marcação", () => {
    expect(plainText("**a** [b](/x)\n- c\n- d", OPTS)).toBe("a b c; d");
  });
});
