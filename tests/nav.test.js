import { describe, it, expect } from "vitest";
import { buildNavSections, isNavActive, hasNavBadge } from "../utils/nav.js";

const ids = (sections) => sections.map((s) => [s.id, s.items.map((i) => i.id)]);

describe("buildNavSections", () => {
  it("membro sem recursos opcionais: só o que a página permite", () => {
    expect(ids(buildNavSections({}))).toEqual([
      ["estabelecimento", ["agenda", "vendas", "clientes", "estoque", "checkin"]],
      ["atendimento", ["whatsapp"]],
    ]);
  });

  it("admin com tudo ligado: agrupa atendimento, gestão e configurações", () => {
    expect(ids(buildNavSections({ isAdmin: true, assistantEnabled: true, integrationsAvailable: true }))).toEqual([
      ["estabelecimento", ["agenda", "vendas", "clientes", "estoque", "checkin"]],
      ["atendimento", ["whatsapp", "assistente", "integracoes"]],
      ["gestao", ["relatorios", "financeiro"]],
      ["configuracoes", ["profissionais", "plano", "configuracoes"]],
    ]);
  });

  it("Assistente e Integrações ficam escondidos com o recurso desligado, mesmo para admin", () => {
    const sections = buildNavSections({ isAdmin: true });
    const all = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(all).not.toContain("assistente");
    expect(all).not.toContain("integracoes");
  });

  it("Integrações aparece para membro (a página é de membro) quando o core oferece", () => {
    const all = buildNavSections({ integrationsAvailable: true }).flatMap((s) => s.items.map((i) => i.id));
    expect(all).toContain("integracoes");
  });

  it("itens de admin nunca aparecem para membro e seção vazia some", () => {
    const sections = buildNavSections({ isAdmin: false, assistantEnabled: true, integrationsAvailable: true });
    expect(sections.map((s) => s.id)).not.toContain("gestao");
    expect(sections.map((s) => s.id)).not.toContain("configuracoes");
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it("todo item tem destino, rótulo e ícone", () => {
    for (const s of buildNavSections({ isAdmin: true, assistantEnabled: true, integrationsAvailable: true })) {
      for (const i of s.items) {
        expect(i.to.startsWith("/")).toBe(true);
        expect(i.label).toBeTruthy();
        expect(i.icon).toBeTruthy();
      }
    }
  });
});

describe("isNavActive", () => {
  const find = (id) => buildNavSections({ isAdmin: true, assistantEnabled: true, integrationsAvailable: true })
    .flatMap((s) => s.items).find((i) => i.id === id);

  it("rota exata e subrotas acendem o item", () => {
    expect(isNavActive(find("whatsapp"), "/whatsapp")).toBe(true);
    expect(isNavActive(find("whatsapp"), "/whatsapp/conversas")).toBe(true);
    expect(isNavActive(find("assistente"), "/assistente/conhecimento")).toBe(true);
  });

  it("abas irmãs de Plano e cobrança e Financeiro mantêm o item ativo", () => {
    expect(isNavActive(find("plano"), "/billing/faturas")).toBe(true);
    expect(isNavActive(find("financeiro"), "/financeiro/pagamentos")).toBe(true);
  });

  it("prefixo parecido não conta (ex.: /vendas-extra)", () => {
    expect(isNavActive(find("vendas"), "/vendas-extra")).toBe(false);
    expect(isNavActive(find("clientes"), "/agenda")).toBe(false);
  });

  it("ignora query e hash e tolera entrada inválida", () => {
    expect(isNavActive(find("agenda"), "/agenda?x=1#a")).toBe(true);
    expect(isNavActive(find("agenda"), undefined)).toBe(false);
    expect(isNavActive(null, "/agenda")).toBe(false);
  });
});

describe("hasNavBadge", () => {
  it("o WhatsApp carrega o selo e existe para qualquer membro", () => {
    expect(hasNavBadge(buildNavSections({}), "whatsapp")).toBe(true);
    expect(hasNavBadge([], "whatsapp")).toBe(false);
    expect(hasNavBadge(undefined, "whatsapp")).toBe(false);
  });
});
