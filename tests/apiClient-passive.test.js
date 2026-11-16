import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { createApiClient, TOKEN_KEY } from "../utils/apiClient.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function client(options) {
  const adapter = async (config) => {
    const response = {
      data: { error: { code: "plan_upgrade_required", message: "Só no Premium.", plan: "free", feature: "instagram" } },
      status: 402, statusText: "", headers: {}, config, request: {},
    };
    throw new axios.AxiosError("status 402", "ERR_BAD_REQUEST", config, {}, response);
  };
  return createApiClient({ axios, baseURL: "http://x", storage: memoryStorage({ [TOKEN_KEY]: "jwt" }), adapter, ...options });
}

describe("carregamento passivo (suppressUpgradePrompt)", () => {
  it("402 normal abre o modal global", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const { api } = client({ onPlanUpgradeRequired });
    const error = await api.get("/integrations/instagram/insights").catch((e) => e);
    expect(onPlanUpgradeRequired).toHaveBeenCalledTimes(1);
    expect(error.handledGlobally).toBe(true);
  });

  it("402 com suppressUpgradePrompt não abre o modal, mas mantém os dados do plano no erro", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const { api } = client({ onPlanUpgradeRequired });
    const error = await api.get("/integrations/instagram/insights", { suppressUpgradePrompt: true }).catch((e) => e);
    expect(onPlanUpgradeRequired).not.toHaveBeenCalled();
    expect(error.handledGlobally).toBeUndefined();
    expect(error.planUpgrade).toMatchObject({ feature: "instagram", plan: "free" });
    expect(error.response.status).toBe(402);
  });
});
