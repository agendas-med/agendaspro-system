// Menu lateral: seções, itens e regras de visibilidade (puro, testável).
// A página decide o acesso de verdade (middleware); aqui só se escolhe o que mostrar.
//   admin               -> itens de administrador (mesma regra de pages/*: access "admin")
//   assistantEnabled    -> "Assistente" só aparece com o recurso ligado no core
//   integrationsAvailable -> "Integrações" só aparece se o core oferecer ao menos uma
// Seções sem itens visíveis não são exibidas (nunca um título solto).

const item = (id, to, label, icon, extra = {}) => ({ id, to, match: to, label, icon, ...extra });

export function buildNavSections({ isAdmin = false, assistantEnabled = false, integrationsAvailable = false } = {}) {
  const sections = [
    {
      id: "estabelecimento",
      label: "ESTABELECIMENTO",
      items: [
        item("agenda", "/agenda", "Agenda", "calendar-day"),
        item("vendas", "/vendas", "Vendas", "bag-shopping"),
        item("clientes", "/clientes", "Clientes", "user-group"),
        item("estoque", "/estoque", "Estoque", "dolly"),
        item("checkin", "/checkin", "Check-in", "circle-check"),
      ],
    },
    {
      id: "atendimento",
      label: "ATENDIMENTO E CANAIS",
      items: [
        item("whatsapp", "/whatsapp", "WhatsApp", "comments", { badge: "whatsapp" }),
        assistantEnabled && item("assistente", "/assistente", "Assistente", "wand-magic-sparkles"),
        integrationsAvailable && item("integracoes", "/integracoes", "Integrações", "plug"),
      ],
    },
    {
      id: "gestao",
      label: "GESTÃO",
      items: [
        isAdmin && item("relatorios", "/relatorios", "Relatórios", "chart-simple"),
        isAdmin && item("financeiro", "/financeiro/pagamentos", "Financeiro", "wallet", { match: "/financeiro" }),
      ],
    },
    {
      id: "configuracoes",
      label: "CONFIGURAÇÕES",
      items: [
        isAdmin && item("profissionais", "/profissionais", "Profissionais", "user-tie"),
        isAdmin && item("plano", "/billing/plano", "Plano e cobrança", "credit-card", { match: "/billing" }),
        isAdmin && item("configuracoes", "/configuracoes", "Configurações", "gear"),
      ],
    },
  ];
  return sections
    .map((s) => ({ ...s, items: s.items.filter(Boolean) }))
    .filter((s) => s.items.length > 0);
}

// Ativo na própria rota ou em qualquer subrota (ex.: /billing/faturas acende "Plano e cobrança").
export function isNavActive(navItem, path) {
  const current = typeof path === "string" ? path.split("?")[0].split("#")[0] : "";
  const base = navItem && navItem.match ? navItem.match : "";
  if (!base) return false;
  return current === base || current.startsWith(base + "/");
}

// Alguma seção visível tem item com esse selo? (o polling só liga se o item existe)
export function hasNavBadge(sections, badge) {
  return (sections || []).some((s) => s.items.some((i) => i.badge === badge));
}
