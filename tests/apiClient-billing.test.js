import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { createApiClient, TOKEN_KEY, REFRESH_KEY } from "../utils/apiClient.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function client(handlers, options = {}) {
  const adapter = async (config) => {
    const key = `${String(config.method).toUpperCase()} ${String(config.url).split("?")[0]}`;
    const result = handlers[key] ? await handlers[key](config) : { status: 404, data: {} };
    const response = { data: result.data ?? {}, status: result.status ?? 200, statusText: "", headers: {}, config, request: {} };
    if (response.status >= 400) throw new axios.AxiosError(`status ${response.status}`, "ERR_BAD_REQUEST", config, {}, response);
    return response;
  };
  return createApiClient({ axios, baseURL: "http://x", storage: memoryStorage({ [TOKEN_KEY]: "jwt" }), adapter, ...options });
}

describe("402 / 503 globais", () => {
  it("402 plan_upgrade_required chama o callback com quota/limit/used e marca o erro", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const { api } = client({
      "POST /professionals": () => ({
        status: 402,
        data: { error: { code: "plan_upgrade_required", message: "Limite do plano Free atingido.", plan: "free", quota: "max_professionals", limit: 1, used: 1 } },
      }),
    }, { onPlanUpgradeRequired });

    const error = await api.post("/professionals", {}).catch((e) => e);

    expect(onPlanUpgradeRequired).toHaveBeenCalledTimes(1);
    expect(onPlanUpgradeRequired.mock.calls[0][0]).toMatchObject({ quota: "max_professionals", limit: 1, used: 1, plan: "free" });
    expect(error.handledGlobally).toBe(true);
    expect(error.friendlyMessage).toBe("Limite do plano Free atingido.");
  });

  it("402 sem o code não abre o modal de upgrade", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const { api } = client({ "GET /x": () => ({ status: 402, data: { message: "pagamento" } }) }, { onPlanUpgradeRequired });
    const error = await api.get("/x").catch((e) => e);
    expect(onPlanUpgradeRequired).not.toHaveBeenCalled();
    expect(error.handledGlobally).toBeUndefined();
  });

  it("503 billing_disabled chama onBillingDisabled; 503 comum não", async () => {
    const onBillingDisabled = vi.fn();
    const { api } = client({
      "POST /billing/subscription": () => ({ status: 503, data: { error: { code: "billing_disabled", message: "off" } } }),
      "GET /down": () => ({ status: 503, data: "<html>Service Unavailable</html>" }),
    }, { onBillingDisabled });

    const a = await api.post("/billing/subscription", { plan_code: "premium" }).catch((e) => e);
    const b = await api.get("/down").catch((e) => e);

    expect(onBillingDisabled).toHaveBeenCalledTimes(1);
    expect(a.handledGlobally).toBe(true);
    expect(b.handledGlobally).toBeUndefined();
  });

  it("sem callbacks o erro segue para a tela (não marca como tratado)", async () => {
    const { api } = client({ "GET /x": () => ({ status: 402, data: { error: { code: "plan_upgrade_required", message: "m" } } }) });
    const error = await api.get("/x").catch((e) => e);
    expect(error.handledGlobally).toBeUndefined();
    expect(error.response.status).toBe(402);
  });

  it("callback que lança não derruba a requisição", async () => {
    const { api } = client({ "GET /x": () => ({ status: 402, data: { error: { code: "plan_upgrade_required" } } }) }, {
      onPlanUpgradeRequired: () => { throw new Error("ui"); },
    });
    const error = await api.get("/x").catch((e) => e);
    expect(error.response.status).toBe(402);
  });
});

describe("login Google", () => {
  it("guarda {token, refreshToken} do google-login", () => {
    const storage = memoryStorage();
    const { storeLoginResponse } = createApiClient({ axios, baseURL: "http://x", storage });
    const access = storeLoginResponse({ returnObj: { token: "g-jwt", refreshToken: "g-refresh" } });
    expect(access).toBe("g-jwt");
    expect(storage.getItem(TOKEN_KEY)).toBe("g-jwt");
    expect(storage.getItem(REFRESH_KEY)).toBe("g-refresh");
  });

  it("401 no google-login (com ou sem barra inicial) é credencial inválida, não token expirado", async () => {
    for (const url of ["/users/google-login", "users/google-login"]) {
      const calls = [];
      const storage = memoryStorage({ [TOKEN_KEY]: "old", [REFRESH_KEY]: "r" });
      const adapter = async (config) => {
        calls.push(`${config.method} ${config.url}`);
        const response = { data: { message: "Falha no login" }, status: 401, statusText: "", headers: {}, config, request: {} };
        throw new axios.AxiosError("401", "ERR_BAD_REQUEST", config, {}, response);
      };
      const { api } = createApiClient({ axios, baseURL: "http://x", storage, adapter });

      await api.post(url, { token: "c" }).catch(() => {});

      expect(calls).toHaveLength(1);
      expect(storage.getItem(TOKEN_KEY)).toBe("old");
    }
  });
});
