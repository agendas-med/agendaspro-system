// Fluxo OAuth das integrações (Instagram e Google Agenda), do lado do painel:
//   1) POST .../connect/start { redirect_uri } -> { authorize_url, state }
//   2) redireciona o navegador para authorize_url (validada: https e host do provedor)
//   3) o provedor volta em redirect_uri com ?code&state (ou ?error...)
//   4) POST .../callback { code, state } (uma única vez; a query é limpa antes)
// Puro: nenhum acesso a window; origem, storage e navegação são injetados.
import { safeHttpsUrl } from "./integrations.js";

export const OAUTH_PROVIDERS = {
  instagram: {
    key: "instagram",
    name: "Instagram",
    callbackPath: "/oauth/instagram",
    returnPath: "/integracoes/instagram",
    apiBase: "/integrations/instagram",
    // Hosts aceitos para authorize_url (sufixo). O core nunca devolve outro domínio.
    hosts: ["instagram.com", "facebook.com"],
  },
  google: {
    key: "google",
    name: "Google Agenda",
    callbackPath: "/oauth/google-agenda",
    returnPath: "/integracoes/google-agenda",
    apiBase: "/integrations/google-calendar",
    hosts: ["accounts.google.com", "google.com"],
  },
};

export const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const storageKey = (provider) => `agendaspro_oauth_${provider}`;

export function providerConfig(provider) {
  return OAUTH_PROVIDERS[provider] || null;
}

// redirect_uri enviada ao core: origem do painel + rota do callback (precisa estar na allowlist do servidor).
export function redirectUriFor(provider, origin) {
  const cfg = providerConfig(provider);
  const base = typeof origin === "string" ? origin.replace(/\/+$/, "") : "";
  if (!cfg || !base) return "";
  return `${base}${cfg.callbackPath}`;
}

function hostMatches(hostname, suffixes) {
  const host = String(hostname || "").toLowerCase();
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

// authorize_url só é seguida se for https no domínio do provedor (ou http local, apenas em desenvolvimento).
export function safeAuthorizeUrl(provider, url, { allowLocal = false } = {}) {
  const cfg = providerConfig(provider);
  if (!cfg) return "";
  const safe = safeHttpsUrl(url, { allowLocalHttp: allowLocal });
  if (!safe) return "";
  const parsed = new URL(safe);
  if (allowLocal && parsed.protocol === "http:") return safe; // mock local
  return hostMatches(parsed.hostname, cfg.hosts) ? safe : "";
}

// Um "#_" no fim do code (Instagram) é removido (o core também faz isso; aqui evita enviar lixo).
export function cleanAuthCode(code) {
  return typeof code === "string" ? code.trim().replace(/#_$/, "") : "";
}

const first = (value) => (Array.isArray(value) ? value[0] : value);
const str = (value) => {
  const v = first(value);
  return typeof v === "string" ? v : "";
};

// Mensagens para ?error= do provedor (nunca exibe texto cru da URL).
const DENIED = new Set(["access_denied", "user_denied", "consent_required", "login_required"]);

// Interpreta a query do retorno: { kind: "none" | "code" | "denied" | "error", code?, state?, reason? }.
export function parseOauthCallback(query) {
  const q = query && typeof query === "object" ? query : {};
  const error = str(q.error);
  const reason = str(q.error_reason);
  if (error || reason) {
    const denied = DENIED.has(error) || DENIED.has(reason);
    return {
      kind: denied ? "denied" : "error",
      reason: denied
        ? "A autorização foi cancelada. Nada foi conectado."
        : "O provedor recusou a conexão. Tente novamente.",
    };
  }
  const code = cleanAuthCode(str(q.code));
  const state = str(q.state).trim();
  if (!code && !state) return { kind: "none" };
  if (!code || !state) return { kind: "error", reason: "O retorno da autorização veio incompleto. Inicie a conexão de novo." };
  if (code.length > 2048 || state.length > 2048) return { kind: "error", reason: "O retorno da autorização é inválido. Inicie a conexão de novo." };
  return { kind: "code", code, state };
}

// ---- Estado pendente (sessionStorage): confere o retorno com o pedido feito nesta aba ----------

export function savePending(storage, provider, { state, companyId = "", now = Date.now() }) {
  if (!storage) return;
  try {
    storage.setItem(storageKey(provider), JSON.stringify({ state, companyId: String(companyId || ""), at: now }));
  } catch {
    // storage cheio/bloqueado: o core continua validando o state
  }
}

export function readPending(storage, provider) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(provider));
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data.state === "string" ? data : null;
  } catch {
    return null;
  }
}

export function clearPending(storage, provider) {
  if (!storage) return;
  try {
    storage.removeItem(storageKey(provider));
  } catch {
    // ignora
  }
}

// Confere o retorno com o pedido guardado. Sem pedido guardado (outra aba/navegador) o core decide pelo state assinado.
// Retorna { ok: true } ou { ok: false, reason }.
export function checkPending(pending, { state, companyId = "", now = Date.now() }) {
  if (!pending) return { ok: true, known: false };
  if (pending.state !== state) {
    return { ok: false, reason: "Este retorno não corresponde ao último pedido de conexão. Inicie a conexão de novo." };
  }
  if (now - pending.at > PENDING_MAX_AGE_MS) {
    return { ok: false, reason: "O pedido de conexão expirou. Inicie a conexão de novo." };
  }
  if (pending.companyId && companyId && String(pending.companyId) !== String(companyId)) {
    return { ok: false, reason: "A empresa selecionada mudou durante a conexão. Inicie de novo na empresa desejada." };
  }
  return { ok: true, known: true };
}
