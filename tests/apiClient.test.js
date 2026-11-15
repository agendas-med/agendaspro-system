import { describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import {
  createApiClient, extractTokens, TOKEN_KEY, REFRESH_KEY,
} from "../utils/apiClient.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    dump: () => ({ ...data }),
  };
}

// Servidor falso: handlers por "METODO /caminho"; registra as chamadas.
function fakeServer(handlers) {
  const calls = [];
  const adapter = async (config) => {
    const url = String(config.url).split("?")[0];
    const key = `${String(config.method).toUpperCase()} ${url}`;
    calls.push({ key, config });
    const handler = handlers[key];
    const result = handler ? await handler(config, calls) : { status: 404, data: { message: "nao existe" } };
    const response = {
      data: result.data ?? {}, status: result.status ?? 200, statusText: "", headers: {}, config, request: {},
    };
    if (response.status >= 400) {
      throw new axios.AxiosError(`status ${response.status}`, "ERR_BAD_REQUEST", config, {}, response);
    }
    return response;
  };
  return { adapter, calls };
}

const count = (calls, key) => calls.filter((c) => c.key === key).length;

describe("extractTokens", () => {
  it("lê as formas conhecidas", () => {
    expect(extractTokens({ returnObj: { jwtToken: "a", refresh_token: "r" } })).toEqual({ access: "a", refresh: "r" });
    expect(extractTokens({ returnObj: { token: "g" } })).toEqual({ access: "g", refresh: "" });
    expect(extractTokens({ returnObj: { newToken: "n" } }).access).toBe("n");
    expect(extractTokens(null)).toEqual({ access: "", refresh: "" });
  });
});

describe("cliente de API", () => {
  let storage;
  beforeEach(() => { storage = memoryStorage({ [TOKEN_KEY]: "old" }); });

  it("401 simultâneos disparam uma única renovação (legado check_jwt)", async () => {
    const server = fakeServer({
      "GET /data": (config) => (config.headers.Authorization === "Bearer new"
        ? { data: { ok: true } } : { status: 401, data: {} }),
      "POST /users/check_jwt": async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { data: { returnObj: { newToken: "new" } } };
      },
    });
    const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    const results = await Promise.all([api.get("/data"), api.get("/data"), api.get("/data")]);

    expect(results.map((r) => r.data.ok)).toEqual([true, true, true]);
    expect(count(server.calls, "POST /users/check_jwt")).toBe(1);
    expect(storage.getItem(TOKEN_KEY)).toBe("new");
  });

  it("usa refresh_token quando existe e guarda o rotacionado", async () => {
    storage.setItem(REFRESH_KEY, "r1");
    const server = fakeServer({
      "GET /data": (config) => (config.headers.Authorization === "Bearer new"
        ? { data: { ok: true } } : { status: 401, data: {} }),
      "POST /users/refresh": (config) => {
        expect(JSON.parse(config.data)).toEqual({ refresh_token: "r1" });
        return { data: { returnObj: { jwtToken: "new", refresh_token: "r2" } } };
      },
    });
    const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    const res = await api.get("/data");

    expect(res.data.ok).toBe(true);
    expect(count(server.calls, "POST /users/check_jwt")).toBe(0);
    expect(storage.getItem(REFRESH_KEY)).toBe("r2");
  });

  it("cai para check_jwt se /users/refresh não existir (404)", async () => {
    storage.setItem(REFRESH_KEY, "r1");
    const server = fakeServer({
      "GET /data": (config) => (config.headers.Authorization === "Bearer new"
        ? { data: { ok: true } } : { status: 401, data: {} }),
      "POST /users/check_jwt": () => ({ data: { returnObj: { newToken: "new" } } }),
    });
    const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    expect((await api.get("/data")).data.ok).toBe(true);
    expect(count(server.calls, "POST /users/refresh")).toBe(1);
    expect(count(server.calls, "POST /users/check_jwt")).toBe(1);
  });

  it("renovação falha: limpa sessão, avisa e rejeita com mensagem amigável", async () => {
    let expired = 0;
    const server = fakeServer({
      "GET /data": () => ({ status: 401, data: {} }),
      "POST /users/check_jwt": () => ({ status: 401, data: {} }),
    });
    const { api } = createApiClient({
      axios, baseURL: "http://x", storage, adapter: server.adapter, onSessionExpired: () => { expired += 1; },
    });

    await expect(api.get("/data")).rejects.toMatchObject({ friendlyMessage: expect.any(String) });
    expect(expired).toBe(1);
    expect(storage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("não tenta renovar em rotas de autenticação (login com senha errada)", async () => {
    const server = fakeServer({
      "POST /users/login": () => ({ status: 401, data: { message: "Credenciais inválidas" } }),
    });
    const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    await expect(api.post("/users/login", {})).rejects.toMatchObject({ friendlyMessage: "Credenciais inválidas" });
    expect(server.calls).toHaveLength(1);
    expect(storage.getItem(TOKEN_KEY)).toBe("old");
  });

  it("não loopa: segunda resposta 401 após renovar é rejeitada", async () => {
    const server = fakeServer({
      "GET /data": () => ({ status: 401, data: {} }),
      "POST /users/check_jwt": () => ({ data: { returnObj: { newToken: "new" } } }),
    });
    const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    await expect(api.get("/data")).rejects.toBeTruthy();
    expect(count(server.calls, "GET /data")).toBe(2);
    expect(count(server.calls, "POST /users/check_jwt")).toBe(1);
  });

  it("logout ignora 404 do servidor e limpa o armazenamento", async () => {
    storage.setItem(REFRESH_KEY, "r1");
    const server = fakeServer({}); // /users/logout => 404
    const { logout } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    await expect(logout()).resolves.toBeUndefined();
    expect(count(server.calls, "POST /users/logout")).toBe(1);
    expect(storage.getItem(TOKEN_KEY)).toBeNull();
    expect(storage.getItem(REFRESH_KEY)).toBeNull();
  });

  it("logout envia o refresh_token quando existe", async () => {
    storage.setItem(REFRESH_KEY, "r1");
    const server = fakeServer({ "POST /users/logout": () => ({ data: {} }) });
    const { logout } = createApiClient({ axios, baseURL: "http://x", storage, adapter: server.adapter });

    await logout();
    expect(JSON.parse(server.calls[0].config.data)).toEqual({ refresh_token: "r1" });
  });
});
