// Erros padronizados de plano/cobrança do core (F2):
//   402 { error: { code: "plan_upgrade_required", message, plan, quota?, limit?, used?, feature? } }
//   503 { error: { code: "billing_disabled", message } }
// Sempre discrimina pelo `code`: um 503 sem esse código é só serviço fora do ar (dyno dormindo).

export const PLAN_UPGRADE_CODE = "plan_upgrade_required";
export const BILLING_DISABLED_CODE = "billing_disabled";

export const BILLING_DISABLED_MESSAGE = "A cobrança de planos não está disponível no momento. Tente novamente mais tarde.";

const QUOTA_LABELS = {
  max_professionals: "profissionais",
  max_team_users: "usuários da equipe",
  whatsapp_monthly_messages: "mensagens de WhatsApp por mês",
};

const PLAN_NAMES = { free: "Free", premium: "Premium" };

function codedBody(error) {
  const body = error && error.response && error.response.data;
  return body && typeof body === "object" && body.error && typeof body.error === "object" ? body.error : null;
}

export function isPlanUpgradeError(error) {
  const status = error && error.response && error.response.status;
  const coded = codedBody(error);
  return status === 402 && !!coded && coded.code === PLAN_UPGRADE_CODE;
}

export function isBillingDisabledError(error) {
  const status = error && error.response && error.response.status;
  const coded = codedBody(error);
  return status === 503 && !!coded && coded.code === BILLING_DISABLED_CODE;
}

function toInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Normaliza o corpo do 402 para o que o modal de upgrade precisa.
export function planUpgradeInfo(error) {
  const coded = codedBody(error) || {};
  const plan = typeof coded.plan === "string" ? coded.plan : "";
  return {
    message: typeof coded.message === "string" && coded.message.trim()
      ? coded.message.trim()
      : "Seu plano atual não permite esta ação.",
    plan,
    planName: PLAN_NAMES[plan] || plan,
    quota: typeof coded.quota === "string" ? coded.quota : "",
    feature: typeof coded.feature === "string" ? coded.feature : "",
    limit: toInt(coded.limit),
    used: toInt(coded.used),
  };
}

export function quotaLabel(quota) {
  return QUOTA_LABELS[quota] || "";
}

// "Plano Free: limite de 1 profissionais (em uso: 1)". Vazio se não houver quota/limite.
export function describeQuota(info) {
  if (!info || info.limit == null) return "";
  const what = quotaLabel(info.quota);
  const plan = info.planName ? `Plano ${info.planName}: ` : "";
  const limit = what ? `limite de ${info.limit} ${what}` : `limite de ${info.limit}`;
  const used = info.used != null ? ` (em uso: ${info.used})` : "";
  return `${plan}${limit}${used}`;
}

// Evita um segundo aviso (toast/modal de erro) para um erro que o interceptor já tratou globalmente.
// handled: { at, message } gravado pelo plugin da API; message: texto que a tela quer exibir.
export const HANDLED_WINDOW_MS = 5000;

export function isAlreadyHandled(handled, message, now = Date.now()) {
  if (!handled || !handled.at || !handled.message) return false;
  if (now - handled.at > HANDLED_WINDOW_MS) return false;
  return String(message == null ? "" : message).trim() === handled.message;
}

// Estado do prompt de upgrade (reativo em plugins/global.js).
export function emptyUpgradePrompt() {
  return { show: false, info: null };
}
