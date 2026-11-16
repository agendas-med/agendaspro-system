// Base comum das integrações F6 (Instagram e Google Agenda): classificação de erros do core,
// URLs seguras, tempo relativo e estado de blocos de tela. Puro e testável (sem Nuxt).
//
// Contrato do core: erros { error: { code, message, ...detalhes } }; sucesso { data }.

export const ADMIN_ONLY_MESSAGE = "Somente administradores podem conectar ou alterar integrações.";

// Só links https abrem em nova aba (nunca javascript:/data:/http). Devolve "" se não for seguro.
export function safeHttpsUrl(url, { allowLocalHttp = false } = {}) {
  if (typeof url !== "string") return "";
  const text = url.trim();
  if (!text || text.length > 2048) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (parsed.username || parsed.password) return "";
  if (parsed.protocol === "https:") return parsed.toString();
  if (allowLocalHttp && parsed.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) {
    return parsed.toString();
  }
  return "";
}

function codedBody(error) {
  const body = error && error.response && error.response.data;
  return body && typeof body === "object" && body.error && typeof body.error === "object" ? body.error : null;
}

// "14:30" ou "dia 16/11 às 14:30" a partir de um ISO; vazio se inválido.
export function formatRetryAt(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? hhmm : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${hhmm}`;
}

const PROVIDER_NAMES = { instagram: "Instagram", google: "Google Agenda" };

// Classifica qualquer erro de chamada às rotas /integrations/*.
// Retorna { kind, message, code, status, handledGlobally, retryAt?, retryable? }.
// kinds: upgrade | admin_required | forbidden | reauth_required | rate_limited | not_configured | not_connected
//        | oauth_state_invalid | redirect_not_allowed | oauth_failed | unavailable | network | timeout
//        | not_found | conflict | validation | unauthorized | server
export function classifyIntegrationError(error, { provider = "instagram", now = Date.now() } = {}) {
  const name = PROVIDER_NAMES[provider] || "A integração";
  const status = error && error.response && error.response.status;
  const coded = codedBody(error);
  const code = coded && typeof coded.code === "string" ? coded.code : "";
  const serverMessage = coded && typeof coded.message === "string" ? coded.message.trim() : "";
  const make = (kind, message, extra = {}) => ({
    kind, message, code, status: status || 0, handledGlobally: !!(error && error.handledGlobally), ...extra,
  });

  if (!error || !error.response) {
    const timeout = error && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" || /timeout/i.test(error.message || ""));
    return make(timeout ? "timeout" : "network", timeout
      ? "O servidor demorou para responder. Tente novamente."
      : "Não foi possível conectar ao servidor. Verifique sua conexão com a internet.", { retryable: true });
  }

  if (status === 402 && code === "plan_upgrade_required") {
    return make("upgrade", serverMessage || `${name} está disponível no plano Premium.`, {
      feature: coded.feature ? String(coded.feature) : "",
      plan: coded.plan ? String(coded.plan) : "",
    });
  }
  if (status === 403 && code === "admin_required") return make("admin_required", ADMIN_ONLY_MESSAGE);
  if (status === 403) return make("forbidden", serverMessage || "Você não tem permissão para esta ação.");
  if (status === 401) return make("unauthorized", "Sua sessão expirou. Entre novamente.");

  if (status === 409 && /reauth_required$/.test(code)) {
    return make("reauth_required", `A conexão com ${name} expirou ou foi revogada. Reconecte a conta para continuar.`);
  }
  if (status === 409) {
    return make("conflict", serverMessage || "Conflito: o registro já existe ou foi alterado.");
  }

  if (status === 429) {
    const retryAt = coded && typeof coded.retry_at === "string" ? coded.retry_at : "";
    const when = retryAt ? formatRetryAt(retryAt, now) : "";
    const base = code === "rate_limited"
      ? "Você atingiu o limite de sincronizações por hora."
      : `${name} limitou as consultas por um tempo.`;
    return make("rate_limited", when ? `${base} Tente novamente a partir das ${when}.` : `${base} Tente novamente mais tarde.`, { retryAt });
  }

  if (status === 503 && code === "integration_not_configured") {
    return make("not_configured", `${name} ainda não está configurado neste ambiente.`);
  }
  if (status === 404 && code === "integration_not_connected") {
    return make("not_connected", `${name} não está conectado.`);
  }
  if (status === 404 && code === "professional_not_found") return make("not_found", "Profissional não encontrado.");
  if (status === 404 && code === "calendar_not_found") return make("not_found", "Esse calendário não aparece na conta conectada.");
  if (status === 404) return make("not_found", serverMessage || "Recurso não encontrado.");

  if (status === 400 && code === "oauth_state_invalid") {
    return make("oauth_state_invalid", "O pedido de conexão expirou ou já foi usado. Inicie a conexão de novo.");
  }
  if (status === 400 && code === "redirect_uri_not_allowed") {
    return make("redirect_not_allowed", "O endereço de retorno deste painel não está autorizado no servidor. Fale com o suporte.");
  }
  if (status === 400) return make("validation", serverMessage || "Dados inválidos. Revise e tente novamente.");

  if (status === 502 && /oauth_failed$/.test(code)) {
    const provided = coded && coded.provider_code;
    if (provided === "no_refresh_token") {
      return make("oauth_failed", "O Google não liberou o acesso contínuo. Remova o AgendasPRO em myaccount.google.com > Segurança > Acesso de terceiros e conecte de novo.", { providerCode: provided });
    }
    return make("oauth_failed", `Não foi possível concluir a conexão com ${name}. Tente de novo.`, { providerCode: provided ? String(provided) : "" });
  }
  if (status === 502 || status === 503 || status === 504) {
    return make("unavailable", `${name} está indisponível no momento. Tente novamente em instantes.`, { retryable: true });
  }
  if (status >= 500) return make("server", "Erro no servidor. Tente novamente em instantes.", { retryable: true });
  return make("server", serverMessage || "Ocorreu um erro inesperado. Tente novamente.");
}

// ---- Estado dos blocos de tela ---------------------------------------------

// Cada bloco (perfil, posts, insights...) tem seu próprio estado: idle | loading | ready | locked | error.
export function blockState(status = "idle", extra = {}) {
  return { status, message: "", feature: "", retryAt: "", ...extra };
}

// Resultado do classificador -> estado de bloco. 402 vira "locked" (convite ao Premium) e não "error".
export function blockFromError(c) {
  if (c.kind === "upgrade") return blockState("locked", { message: c.message, feature: c.feature || "" });
  return blockState("error", { message: c.message, retryAt: c.retryAt || "", kind: c.kind });
}

// ---- Tempo relativo ---------------------------------------------------------

// "agora", "há 5 min", "há 3 h", "há 2 dias". Vazio se a data for inválida.
export function relativeTime(iso, now = Date.now()) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

// "16/11/2026 14:30" (horário do navegador).
export function formatDateTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2026-11-05" -> "05/11".
export function formatShortDate(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ""));
  return m ? `${m[3]}/${m[2]}` : "";
}

// Dias que faltam até uma data (token do Instagram). null se inválida.
export function daysUntil(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 86400000);
}
