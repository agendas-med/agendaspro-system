// Cliente HTTP (axios) com renovação de sessão. Puro: axios e storage são injetados,
// então é testável sem Nuxt. O plugin plugins/api.js é só um adaptador fino.
//
// Contratos tolerados (o core está mudando em paralelo):
//  - Novo: login devolve refresh_token; renovação em POST {refreshPath} { refresh_token }
//          (pode rotacionar o refresh_token); logout em POST /users/logout.
//  - Legado: sem refresh_token, a renovação é POST /users/check_jwt { token: "Bearer <jwt>" }
//          e o novo JWT vem em returnObj.newToken.
import { apiErrorMessage } from "./errors.js";
import {
  isPlanUpgradeError, isBillingDisabledError, planUpgradeInfo, BILLING_DISABLED_MESSAGE,
} from "./planErrors.js";

export const TOKEN_KEY = "agendaspro_jwt";
export const REFRESH_KEY = "agendaspro_refresh_token";
export const REFRESH_PATH = "/users/refresh";
export const LOGOUT_PATH = "/users/logout";
export const LEGACY_CHECK_PATH = "/users/check_jwt";
// Rotas em que um 401 significa "credencial inválida", nunca "token expirado".
export const AUTH_PATHS = [
  "/users/login",
  "/users/google-login",
  "/users/refresh",
  "/users/logout",
  "/users/check_jwt",
];

// Aceita as formas conhecidas de resposta de login/renovação.
export function extractTokens(data) {
  const body = data && typeof data === "object" ? data : {};
  const o = body.returnObj && typeof body.returnObj === "object" ? body.returnObj : body;
  const access =
    o.jwtToken || o.token || o.access_token || o.accessToken || o.newToken || "";
  const refresh = o.refresh_token || o.refreshToken || "";
  return {
    access: typeof access === "string" ? access : "",
    refresh: typeof refresh === "string" ? refresh : "",
  };
}

function stripBearer(value) {
  return typeof value === "string" ? value.replace(/^Bearer\s+/i, "") : "";
}

function isAuthUrl(url) {
  // Normaliza a barra inicial: "users/login" e "/users/login" são a mesma rota.
  const path = "/" + String(url || "").split("?")[0].replace(/^\/+/, "");
  return AUTH_PATHS.some((p) => path.endsWith(p));
}

export function createApiClient({
  axios,
  baseURL,
  storage,
  timeout = 15000,
  adapter,
  refreshPath = REFRESH_PATH,
  onSessionExpired,
  // 402 plan_upgrade_required -> onPlanUpgradeRequired(info, error); 503 billing_disabled -> onBillingDisabled(error).
  // Quando o erro é tratado globalmente, error.handledGlobally = true (telas evitam mensagem duplicada).
  // Requisição com { suppressUpgradePrompt: true } na config não abre o modal (a tela trata o 402).
  onPlanUpgradeRequired,
  onBillingDisabled,
}) {
  const config = { baseURL, timeout };
  if (adapter) config.adapter = adapter;

  const api = axios.create(config);
  // Instância sem interceptors, usada para renovar/encerrar sessão sem recursão.
  const bare = axios.create(config);

  let refreshing = null;

  const getAccess = () => storage.getItem(TOKEN_KEY);

  const saveTokens = ({ access, refresh }) => {
    if (access) {
      storage.setItem(TOKEN_KEY, access);
      api.defaults.headers.common.Authorization = `Bearer ${access}`;
    }
    if (refresh) storage.setItem(REFRESH_KEY, refresh);
  };

  const clearTokens = () => {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(REFRESH_KEY);
    delete api.defaults.headers.common.Authorization;
  };

  // Guarda o resultado de um login (qualquer formato conhecido). Retorna o access token.
  const storeLoginResponse = (data) => {
    const tokens = extractTokens(data);
    saveTokens(tokens);
    return tokens.access;
  };

  async function doRefresh(usedToken) {
    // Outra aba/requisição já rotacionou o token: usa o atual em vez de renovar de novo.
    const current = getAccess();
    if (current && usedToken && current !== usedToken) return current;

    const refreshToken = storage.getItem(REFRESH_KEY);
    if (refreshToken) {
      try {
        const { data } = await bare.post(refreshPath, { refresh_token: refreshToken });
        const tokens = extractTokens(data);
        if (!tokens.access) throw new Error("Resposta de renovação sem token");
        saveTokens(tokens);
        return tokens.access;
      } catch (error) {
        const status = error && error.response && error.response.status;
        // Endpoint inexistente neste core: cai para o fluxo legado.
        if (status !== 404 && status !== 405) throw error;
      }
    }

    if (!current) throw new Error("Sem sessão para renovar");
    const { data } = await bare.post(LEGACY_CHECK_PATH, { token: `Bearer ${current}` });
    const tokens = extractTokens(data);
    if (!tokens.access) throw new Error("Resposta de renovação sem token");
    saveTokens(tokens);
    return tokens.access;
  }

  // Trava: 401s simultâneos compartilham uma única renovação.
  const refreshSession = (usedToken) => {
    if (!refreshing) {
      refreshing = doRefresh(usedToken).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };

  api.interceptors.request.use((request) => {
    if (!isAuthUrl(request.url)) {
      const hasHeader = request.headers && request.headers.Authorization;
      const access = getAccess();
      if (!hasHeader && access) request.headers.Authorization = `Bearer ${access}`;
    }
    return request;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error && error.config;
      if (error) error.friendlyMessage = apiErrorMessage(error);

      if (isPlanUpgradeError(error)) {
        error.planUpgrade = planUpgradeInfo(error);
        error.friendlyMessage = error.planUpgrade.message;
        // Carregamento passivo (ex.: bloco Premium de uma tela): a tela mostra o próprio convite, sem abrir o modal.
        const passive = !!(original && original.suppressUpgradePrompt);
        if (onPlanUpgradeRequired && !passive) {
          error.handledGlobally = true;
          try { onPlanUpgradeRequired(error.planUpgrade, error); } catch (e) { /* UI nunca derruba a requisição */ }
        }
        return Promise.reject(error);
      }
      if (isBillingDisabledError(error)) {
        error.friendlyMessage = BILLING_DISABLED_MESSAGE;
        if (onBillingDisabled) {
          error.handledGlobally = true;
          try { onBillingDisabled(error); } catch (e) { /* idem */ }
        }
        return Promise.reject(error);
      }

      const status = error && error.response && error.response.status;
      if (status !== 401 || !original || original._retry || isAuthUrl(original.url)) {
        return Promise.reject(error);
      }
      // Sem sessão guardada não há o que renovar.
      if (!getAccess()) return Promise.reject(error);

      original._retry = true;
      const usedToken = stripBearer(original.headers && original.headers.Authorization);

      let token;
      try {
        token = await refreshSession(usedToken);
      } catch (refreshError) {
        const stored = getAccess();
        if (stored && stored !== usedToken) {
          token = stored; // outra aba renovou enquanto esta falhava
        } else {
          clearTokens();
          if (onSessionExpired) onSessionExpired();
          return Promise.reject(error);
        }
      }

      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    },
  );

  // Encerra a sessão no servidor (se o endpoint existir) e limpa o armazenamento local.
  const logout = async () => {
    const access = getAccess();
    const refresh = storage.getItem(REFRESH_KEY);
    if (access || refresh) {
      try {
        await bare.post(
          LOGOUT_PATH,
          refresh ? { refresh_token: refresh } : {},
          { headers: access ? { Authorization: `Bearer ${access}` } : {}, timeout: 5000 },
        );
      } catch (e) {
        // 404 (core sem logout), 401 (já expirado) ou rede: o logout local segue normalmente.
      }
    }
    clearTokens();
  };

  return { api, bare, refreshSession, logout, saveTokens, clearTokens, storeLoginResponse, getAccess };
}
