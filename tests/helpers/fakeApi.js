// Cliente real (interceptors incluídos) sobre um adaptador falso, para testar controladores.
// handlers: { "GET /x": resposta | (config, n) => resposta }, resposta = { status, data } | { network:true } | { timeout:true }
import axios from "axios";
import { createApiClient, TOKEN_KEY } from "../../utils/apiClient.js";

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    dump: () => ({ ...data }),
  };
}

export function fakeApi(handlers, clientOptions = {}) {
  const calls = [];
  const adapter = async (config) => {
    const key = `${String(config.method).toUpperCase()} ${String(config.url).split("?")[0]}`;
    calls.push({ key, body: config.data ? JSON.parse(config.data) : undefined, params: config.params, suppress: !!config.suppressUpgradePrompt });
    const h = handlers[key];
    const result = h ? await (typeof h === "function" ? h(config, calls.filter((c) => c.key === key).length) : h) : { status: 404, data: {} };
    if (result && result.network) throw new axios.AxiosError("Network Error", "ERR_NETWORK", config, {});
    if (result && result.timeout) throw new axios.AxiosError("timeout of 45000ms exceeded", "ECONNABORTED", config, {});
    const response = { data: result.data ?? {}, status: result.status ?? 200, statusText: "", headers: {}, config, request: {} };
    if (response.status >= 400) throw new axios.AxiosError(`status ${response.status}`, "ERR_BAD_REQUEST", config, {}, response);
    return response;
  };
  const { api } = createApiClient({ axios, baseURL: "http://x", storage: memoryStorage({ [TOKEN_KEY]: "jwt" }), adapter, ...clientOptions });
  return { api, calls, count: (key) => calls.filter((c) => c.key === key).length };
}

export const err = (status, code, extra = {}) => ({ status, data: { error: { code, message: `msg ${code}`, ...extra } } });
export const ok = (data, status = 200) => ({ status, data: { data } });
