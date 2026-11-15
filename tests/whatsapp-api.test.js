import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { createApiClient, TOKEN_KEY } from "../utils/apiClient.js";
import { classifySendError, buildTemplatePayload, normalizeUsage } from "../utils/whatsapp.js";
import { unwrap } from "../utils/payloads.js";
import { buildQr, qrSvgMarkup } from "../utils/qr.js";
import { copyText } from "../utils/clipboard.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// Cliente real (interceptors incluídos) sobre um adaptador falso, como nos testes de billing.
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

const SEND = "POST /whatsapp/conversations/9/messages";
const sendWith = (status, error) => client({ [SEND]: () => ({ status, data: { error } }) });

describe("envio via cliente HTTP: contrato de erros F4", () => {
  it("201 devolve a mensagem em { data }", async () => {
    const { api } = client({ [SEND]: () => ({ status: 201, data: { data: { id: 55, direction: "out", author: "agent", body: "oi", status: "queued" } } }) });
    const res = await api.post("/whatsapp/conversations/9/messages", { text: "oi" });
    expect(unwrap(res)).toMatchObject({ id: 55, status: "queued" });
  });

  it.each([
    [409, "window_closed", "window_closed"],
    [409, "opted_out", "opted_out"],
    [409, "template_unavailable", "template_unavailable"],
    [400, "template_params", "template_params"],
    [404, "conversation_not_found", "not_found"],
    [409, "whatsapp_not_configured", "not_configured"],
    [502, "send_failed", "send_failed"],
  ])("%i %s -> %s", async (status, code, kind) => {
    const { api } = sendWith(status, { code, message: "m" });
    const error = await api.post("/whatsapp/conversations/9/messages", { text: "x" }).catch((e) => e);
    expect(error.handledGlobally).toBeUndefined();
    expect(classifySendError(error).kind).toBe(kind);
  });

  it("402 abre o convite global e a tela só marca o aviso inline (sem toast duplicado)", async () => {
    const onPlanUpgradeRequired = vi.fn();
    const { api } = client({
      [SEND]: () => ({ status: 402, data: { error: { code: "plan_upgrade_required", message: "Limite do plano Free atingido.", plan: "free", quota: "whatsapp_monthly_messages", limit: 50, used: 50 } } }),
    }, { onPlanUpgradeRequired });
    const error = await api.post("/whatsapp/conversations/9/messages", { text: "x" }).catch((e) => e);
    expect(onPlanUpgradeRequired).toHaveBeenCalledWith(expect.objectContaining({ quota: "whatsapp_monthly_messages", limit: 50, used: 50 }), error);
    expect(error.handledGlobally).toBe(true);
    expect(classifySendError(error)).toMatchObject({ kind: "upgrade", handledGlobally: true });
  });

  it("503 sem código (dyno dormindo) não é tratado como cobrança", async () => {
    const onBillingDisabled = vi.fn();
    const { api } = client({ "GET /whatsapp/status": () => ({ status: 503, data: {} }) }, { onBillingDisabled });
    const error = await api.get("/whatsapp/status").catch((e) => e);
    expect(onBillingDisabled).not.toHaveBeenCalled();
    expect(error.handledGlobally).toBeUndefined();
    expect(error.friendlyMessage).toMatch(/indisponível/);
  });

  it("corpo enviado ao core: texto XOR modelo", () => {
    const tpl = { name: "atendimento_retomar", paramCount: 1 };
    const body = buildTemplatePayload(tpl, ["Clínica"]).payload;
    expect(Object.keys(body).sort()).toEqual(["params", "template"]);
  });
});

describe("leitura: formato { data }", () => {
  it("usage e listas passam por unwrap", async () => {
    const { api } = client({
      "GET /whatsapp/usage": () => ({ data: { data: { period: "2026-11", plan: "free", messages: { used: 3, limit: 50 }, breakdown: {}, ai: {} } } }),
    });
    const usage = normalizeUsage(unwrap(await api.get("/whatsapp/usage")));
    expect(usage).toMatchObject({ used: 3, limit: 50, percent: 6 });
  });
});

describe("QR code", () => {
  it("gera um caminho SVG só com números e comandos de desenho", () => {
    const qr = buildQr("https://wa.me/5511999999999?text=Agendar%20clinica");
    expect(qr.size).toBeGreaterThan(20);
    expect(qr.path).toMatch(/^[MhvzM0-9,\-]+$/);
    // Margem de silêncio: nenhum módulo escuro na borda.
    expect(qr.path.startsWith("M4,4")).toBe(true);
    expect(qrSvgMarkup(qr)).toContain(`viewBox="0 0 ${qr.size} ${qr.size}"`);
  });
  it("é determinístico e vazio retorna null", () => {
    expect(buildQr("abc").path).toBe(buildQr("abc").path);
    expect(buildQr("")).toBeNull();
    expect(buildQr(null)).toBeNull();
    expect(qrSvgMarkup(null)).toBe("");
  });
  it("texto grande demais não derruba (null)", () => {
    expect(buildQr("x".repeat(5000))).toBeNull();
  });
});

describe("copiar", () => {
  it("usa a API moderna quando existe", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText("abc", { navigator: { clipboard: { writeText } } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });
  it("cai no plano B quando a API moderna falha", async () => {
    const area = { setAttribute() {}, style: {}, select: vi.fn() };
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    const document = { createElement: () => area, body, execCommand: vi.fn(() => true) };
    const env = { navigator: { clipboard: { writeText: async () => { throw new Error("negado"); } } }, document };
    expect(await copyText("abc", env)).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalled();
  });
  it("sem nenhum recurso devolve false", async () => {
    expect(await copyText("abc", {})).toBe(false);
    expect(await copyText("", { navigator: { clipboard: { writeText: async () => {} } } })).toBe(false);
  });
});
