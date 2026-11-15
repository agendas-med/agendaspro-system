// Plano & Cobrança: rótulos, comparativo de planos e helpers de exibição (puros, testáveis).
// Preço e comissão vêm SEMPRE de GET /billing/plans; a matriz abaixo é só o texto comercial dos recursos.

export const BILLING_TYPES = [
  { value: "UNDEFINED", label: "Escolher na fatura" },
  { value: "PIX", label: "Pix" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
];

export const DEFAULT_BILLING_TYPE = "UNDEFINED";

// `soon: true` = recurso previsto para fases seguintes (não oferecido ainda).
export const PLAN_MATRIX = [
  { key: "professionals", label: "Profissionais", free: "1", premium: "Ilimitados" },
  { key: "team", label: "Usuários da equipe", free: "2", premium: "Ilimitados" },
  { key: "whatsapp", label: "Lembretes e confirmação por WhatsApp", free: "Confirmação e lembrete 24h, até 50 mensagens/mês", premium: "Lembretes 24h e 2h, uso ilimitado (uso justo)" },
  { key: "deposit", label: "Cobrança de sinal por Pix no agendamento", free: "Sim", premium: "Sim" },
  { key: "public_page", label: "Página pública com link e QR Code", free: "Sim, com a marca AgendasPro", premium: "Sim, sem marca e com cor/tema", soon: true },
  { key: "waitlist", label: "Lista de espera, reativação de inativos e avaliação no Google", free: "Não", premium: "Sim", soon: true },
  { key: "instagram", label: "Integração com Instagram", free: "Somente o link do perfil", premium: "Métricas, posts e conversão", soon: true },
  { key: "google_calendar", label: "Sincronização com Google Agenda", free: "Não", premium: "Sim", soon: true },
  { key: "assistant", label: "Assistente de IA no painel", free: "30 interações/mês (consulta)", premium: "1.000/mês, com ações confirmadas", soon: true },
  { key: "reports", label: "Relatórios", free: "Básicos, 6 meses de histórico", premium: "Avançados, exportação CSV e histórico ilimitado", soon: true },
];

const SOURCE_LABELS = {
  free: "Plano gratuito",
  paid: "Assinatura ativa",
  grace: "Pagamento em atraso (período de tolerância)",
};

export function entitlementSourceLabel(source) {
  return SOURCE_LABELS[source] || "";
}

const INVOICE_STATUS = {
  pending: { label: "Em aberto", tone: "yellow" },
  paid: { label: "Paga", tone: "green" },
  overdue: { label: "Vencida", tone: "red" },
  refunded: { label: "Estornada", tone: "" },
  canceled: { label: "Cancelada", tone: "" },
};

export function invoiceStatus(status) {
  return INVOICE_STATUS[status] || { label: status ? String(status) : "—", tone: "" };
}

const COMMISSION_STATUS = {
  pending: { label: "Pendente", tone: "yellow" },
  settled: { label: "Liquidada", tone: "green" },
  canceled: { label: "Cancelada", tone: "" },
  refunded: { label: "Estornada", tone: "red" },
};

export function commissionStatus(status) {
  return COMMISSION_STATUS[status] || { label: status ? String(status) : "—", tone: "" };
}

const SUBSCRIPTION_STATUS = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  canceled: "Cancelada",
};

export function subscriptionStatusLabel(status) {
  return SUBSCRIPTION_STATUS[status] || "";
}

// Só abre links https de faturas (nunca javascript:/data:). Devolve "" se não for seguro.
export function safeExternalUrl(url) {
  if (typeof url !== "string") return "";
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

// Premium contratado (ou em tolerância) e pendente de pagamento?
export function hasPendingPayment(overview) {
  return !!(overview && overview.pending_invoice_url && safeExternalUrl(overview.pending_invoice_url));
}

// Período do extrato: omite from/to vazios (o core rejeita string vazia).
export function commissionsParams({ from, to } = {}) {
  const params = {};
  if (from) params.from = String(from);
  if (to) params.to = String(to);
  return params;
}

export function currentMonthRange(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

// Valida o intervalo do extrato; devolve mensagem de erro ou "".
export function validatePeriod({ from, to } = {}) {
  if (from && to && from > to) return "A data inicial deve ser anterior ou igual à final.";
  return "";
}

// Ordena planos pela ordem do catálogo (sort_order) e garante free antes de premium.
export function sortPlans(plans) {
  return [...(Array.isArray(plans) ? plans : [])].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.price_cents) - Number(b.price_cents),
  );
}
