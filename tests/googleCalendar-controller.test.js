import { describe, it, expect, vi } from "vitest";
import { createGoogleCalendarController, initialState } from "../utils/googleCalendarController.js";
import { savePending } from "../utils/oauth.js";
import { fakeApi, memoryStorage, err, ok } from "./helpers/fakeApi.js";

const G = "/integrations/google-calendar";
const NOW = Date.parse("2026-11-16T12:00:00Z");
const link = (over = {}) => ({ id: 1, role: "push", professional_id: null, calendar_id: "c1", calendar_summary: "AgendasPRO", created_by_app: true, ...over });
const statusData = (over = {}) => ({ configured: true, connected: true, account: { email: "a@b.com", status: "active" }, links: [link()], ...over });
const plan = (code) => ok({ entitlement: { plan_code: code } });

function setup(handlers, { storage = memoryStorage() } = {}) {
  const fake = fakeApi(handlers);
  const navigate = vi.fn();
  const ctl = createGoogleCalendarController({
    api: fake.api, state: initialState(), now: () => NOW, storage, origin: () => "https://app.test", navigate, companyId: () => "7",
  });
  return { ctl, state: ctl.state, navigate, storage, ...fake };
}

const base = (over = {}) => ({
  [`GET ${G}/status`]: ok(statusData()),
  "GET /billing/subscription": plan("premium"),
  "GET /professionals": ok([{ id: 5, name: "Ana", active: true }]),
  ...over,
});

describe("status e plano", () => {
  it("conectado Premium: vínculos, plano e profissionais", async () => {
    const { ctl, state, calls } = setup(base());
    await ctl.load();
    expect(ctl.view()).toBe("connected");
    expect(state.premium).toBe(true);
    expect(state.links).toHaveLength(1);
    expect(state.professionals).toHaveLength(1);
    expect(calls.filter((c) => c.key.startsWith("GET /integrations")).every((c) => c.suppress)).toBe(true);
  });
  it("Free é identificado sem chamar rotas Premium", async () => {
    const { ctl, state, calls } = setup(base({ "GET /billing/subscription": plan("free") }));
    await ctl.load();
    expect(state.premium).toBe(false);
    expect(calls.some((c) => c.key === `GET ${G}/calendars`)).toBe(false);
  });
  it("plano indisponível: premium continua desconhecido", async () => {
    const { ctl, state } = setup(base({ "GET /billing/subscription": err(500, "boom") }));
    await ctl.load();
    expect(state.premium).toBeNull();
  });
  it("não configurado e core sem F6", async () => {
    const a = setup({ [`GET ${G}/status`]: err(503, "integration_not_configured") });
    await a.ctl.load();
    expect(a.ctl.view()).toBe("not_configured");
    const b = setup({ [`GET ${G}/status`]: { status: 404, data: {} } });
    await b.ctl.load();
    expect(b.state.available).toBe("no");
  });
  it("reauth_required na conta", async () => {
    const { ctl } = setup(base({ [`GET ${G}/status`]: ok(statusData({ account: { email: "a@b.com", status: "reauth_required", last_error_code: "google_calendar_reauth_required" } })) }));
    await ctl.load();
    expect(ctl.view()).toBe("reauth_required");
  });
});

describe("calendários", () => {
  it("carrega só calendários válidos", async () => {
    const { ctl, state } = setup(base({ [`GET ${G}/calendars`]: ok([{ id: "a", summary: "Principal", access_role: "owner" }, { summary: "sem id" }]) }));
    await ctl.load();
    await ctl.loadCalendars();
    expect(state.calendars.items.map((c) => c.id)).toEqual(["a"]);
    expect(state.calendars.block.status).toBe("ready");
  });
  it("Free: bloqueado sem chamar o core", async () => {
    const { ctl, state, count } = setup(base({ "GET /billing/subscription": plan("free") }));
    await ctl.load();
    await ctl.loadCalendars();
    expect(state.calendars.block.status).toBe("locked");
    expect(count(`GET ${G}/calendars`)).toBe(0);
  });
  it("403 (não admin) e 409 reauth viram erro de bloco", async () => {
    const a = setup(base({ [`GET ${G}/calendars`]: err(403, "admin_required") }));
    await a.ctl.load();
    await a.ctl.loadCalendars();
    expect(a.state.calendars.block.status).toBe("error");
    expect(a.state.calendars.block.message).toContain("administradores");
    const b = setup(base({ [`GET ${G}/calendars`]: err(409, "google_calendar_reauth_required") }));
    await b.ctl.load();
    await b.ctl.loadCalendars();
    expect(b.ctl.view()).toBe("reauth_required");
  });
});

describe("conexão OAuth", () => {
  const start = ok({ authorize_url: "https://accounts.google.com/o/oauth2/v2/auth?x=1", state: "gs1" });
  it("conecta: redirect_uri do painel, pedido guardado e navegação", async () => {
    const { ctl, navigate, calls } = setup({ [`POST ${G}/connect/start`]: start });
    expect((await ctl.connect()).ok).toBe(true);
    expect(calls[0].body).toEqual({ redirect_uri: "https://app.test/oauth/google-agenda" });
    expect(navigate).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1");
  });
  it("402 (Free) marca o plano e não duplica a mensagem do modal global", async () => {
    const { ctl, state, calls } = setup({ [`POST ${G}/connect/start`]: err(402, "plan_upgrade_required", { feature: "google_calendar", plan: "free" }) });
    const r = await ctl.connect();
    expect(r.kind).toBe("upgrade");
    expect(state.premium).toBe(false);
    expect(state.connecting).toBe(false);
    expect(calls[0].suppress).toBe(false);
  });
  it("authorize_url fora do Google é recusada", async () => {
    const { ctl, navigate } = setup({ [`POST ${G}/connect/start`]: ok({ authorize_url: "https://evil.example/", state: "x" }) });
    expect((await ctl.connect()).ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
  it("callback conclui uma vez e atualiza vínculos", async () => {
    const storage = memoryStorage();
    savePending(storage, "google", { state: "gs1", companyId: "7", now: NOW - 60000 });
    const { ctl, state, count } = setup({ [`POST ${G}/callback`]: ok(statusData()) }, { storage });
    const q = { code: "4/abc", state: "gs1" };
    await Promise.all([ctl.completeCallback(q), ctl.completeCallback(q)]);
    expect(count(`POST ${G}/callback`)).toBe(1);
    expect(state.connected).toBe(true);
    expect(state.links).toHaveLength(1);
  });
  it("sem refresh token: orienta remover o acesso no Google", async () => {
    const { ctl, state } = setup({ [`POST ${G}/callback`]: err(502, "google_calendar_oauth_failed", { provider_code: "no_refresh_token" }) });
    await ctl.completeCallback({ code: "c", state: "s" });
    expect(state.callback.status).toBe("error");
    expect(state.callback.message).toContain("myaccount.google.com");
  });
  it("acesso negado", async () => {
    const { ctl, state } = setup({});
    await ctl.completeCallback({ error: "access_denied" });
    expect(state.callback.message).toContain("cancelada");
  });
});

describe("desconectar", () => {
  it("padrão: não apaga calendários e avisa que os eventos ficam no Google", async () => {
    const { ctl, state, calls } = setup(base({ [`POST ${G}/disconnect`]: ok({ disconnected: true, revoked: true, removed_calendars: 0 }) }));
    await ctl.load();
    const r = await ctl.disconnect();
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.key === `POST ${G}/disconnect`).body).toEqual({ remove_app_calendars: false });
    expect(state.connected).toBe(false);
    expect(state.links).toEqual([]);
    expect(state.notice.message).toContain("continuam");
    expect(state.premium).toBe(true);
  });
  it("com remove_app_calendars", async () => {
    const { ctl, state, calls } = setup(base({ [`POST ${G}/disconnect`]: ok({ disconnected: true, removed_calendars: 1 }) }));
    await ctl.load();
    await ctl.disconnect({ removeAppCalendars: true });
    expect(calls.find((c) => c.key === `POST ${G}/disconnect`).body).toEqual({ remove_app_calendars: true });
    expect(state.notice.message).toContain("apagados no Google");
  });
  it("funciona no Free (plano caiu depois de conectar)", async () => {
    const { ctl, state } = setup(base({ "GET /billing/subscription": plan("free"), [`POST ${G}/disconnect`]: ok({ disconnected: true }) }));
    await ctl.load();
    expect((await ctl.disconnect()).ok).toBe(true);
    expect(state.connected).toBe(false);
  });
  it("erro: continua conectado", async () => {
    const { ctl, state } = setup(base({ [`POST ${G}/disconnect`]: err(502, "google_calendar_unavailable") }));
    await ctl.load();
    expect((await ctl.disconnect()).ok).toBe(false);
    expect(state.connected).toBe(true);
    expect(state.disconnecting).toBe(false);
  });
  it("404 not_connected conta como feito", async () => {
    const { ctl, state } = setup(base({ [`POST ${G}/disconnect`]: err(404, "integration_not_connected") }));
    await ctl.load();
    expect((await ctl.disconnect()).ok).toBe(true);
    expect(state.connected).toBe(false);
  });
});

describe("vínculos", () => {
  const withCalendars = (over = {}) => base({ [`GET ${G}/calendars`]: ok([{ id: "c3", summary: "Pessoal", access_role: "owner" }]), ...over });

  it("cria vínculo busy por profissional", async () => {
    const h = withCalendars({
      [`POST ${G}/links`]: ok(link({ id: 2, role: "busy", professional_id: 5, calendar_id: "c3", created_by_app: false }), 201),
      "GET /time-blocks": ok([]),
    });
    const { ctl, state, calls } = setup(h);
    await ctl.load();
    await ctl.loadCalendars();
    const r = await ctl.createLink({ role: "busy", calendarId: "c3", scope: "professional", professionalId: "5" });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.key === `POST ${G}/links`).body).toEqual({ role: "busy", calendar_id: "c3", professional_id: 5 });
    expect(state.links.map((l) => l.id)).toEqual(["1", "2"]);
  });
  it("validação local não chama o core", async () => {
    const { ctl, count } = setup(withCalendars());
    await ctl.load();
    await ctl.loadCalendars();
    const r = await ctl.createLink({ role: "busy", calendarId: "c3", scope: "professional" });
    expect(r.kind).toBe("validation");
    expect(count(`POST ${G}/links`)).toBe(0);
  });
  it("409 calendar_link_conflict mostra o conflito", async () => {
    const h = withCalendars({ [`POST ${G}/links`]: err(409, "calendar_link_conflict") });
    const { ctl, state } = setup(h);
    await ctl.load();
    await ctl.loadCalendars();
    const r = await ctl.createLink({ role: "busy", calendarId: "c3", scope: "company" });
    expect(r.kind).toBe("conflict");
    expect(state.savingLink).toBe(false);
  });
  it("remove vínculo; 404 já removido também limpa a lista", async () => {
    const a = setup(base({ [`DELETE ${G}/links/1`]: ok({ deleted: true }) }));
    await a.ctl.load();
    expect((await a.ctl.deleteLink("1")).ok).toBe(true);
    expect(a.state.links).toEqual([]);
    const b = setup(base({ [`DELETE ${G}/links/1`]: err(404, "calendar_link_not_found") }));
    await b.ctl.load();
    expect((await b.ctl.deleteLink("1")).ok).toBe(true);
    expect(b.state.links).toEqual([]);
  });
  it("erro ao remover mantém o vínculo", async () => {
    const { ctl, state } = setup(base({ [`DELETE ${G}/links/1`]: err(403, "admin_required") }));
    await ctl.load();
    const r = await ctl.deleteLink("1");
    expect(r.ok).toBe(false);
    expect(state.links).toHaveLength(1);
    expect(state.removingLinkId).toBe("");
  });
});

describe("sincronizar agora", () => {
  it("202: aviso de fila e destrava o botão", async () => {
    const { ctl, state } = setup(base({ [`POST ${G}/sync`]: ok({ queued: true }, 202) }));
    await ctl.load();
    expect((await ctl.syncNow()).ok).toBe(true);
    expect(state.notice.kind).toBe("info");
    expect(state.syncing).toBe(false);
  });
  it("429 rate_limited: aviso e bloqueio local até o horário informado", async () => {
    const h = base({ [`POST ${G}/sync`]: err(429, "rate_limited", { retry_at: "2026-11-16T13:00:00Z" }) });
    const { ctl, state, count } = setup(h);
    await ctl.load();
    const r = await ctl.syncNow();
    expect(r.kind).toBe("rate_limited");
    expect(state.syncCooldownUntil).toBe(Date.parse("2026-11-16T13:00:00Z"));
    expect((await ctl.syncNow()).kind).toBe("rate_limited");
    expect(count(`POST ${G}/sync`)).toBe(1);
    expect(state.notice.kind).toBe("warning");
  });
  it("404 not_connected e 409 reauth atualizam o estado", async () => {
    const a = setup(base({ [`POST ${G}/sync`]: err(404, "integration_not_connected") }));
    await a.ctl.load();
    await a.ctl.syncNow();
    expect(a.state.connected).toBe(false);
    const b = setup(base({ [`POST ${G}/sync`]: err(409, "google_calendar_reauth_required") }));
    await b.ctl.load();
    await b.ctl.syncNow();
    expect(b.ctl.view()).toBe("reauth_required");
  });
  it("clique duplo envia uma vez", async () => {
    const { ctl, count } = setup(base({ [`POST ${G}/sync`]: ok({ queued: true }, 202) }));
    await ctl.load();
    await Promise.all([ctl.syncNow(), ctl.syncNow()]);
    expect(count(`POST ${G}/sync`)).toBe(1);
  });
});

describe("bloqueios importados", () => {
  it("lista só os do Google, ordenados, em somente leitura", async () => {
    const blocks = [
      { id: 3, professional_id: null, starts_at: "2026-11-20 10:00", ends_at: "2026-11-20 11:00", reason: "Ocupado (Google Agenda)", source: "google" },
      { id: 1, professional_id: 5, starts_at: "2026-11-18 09:00", ends_at: "2026-11-18 10:00", source: "google" },
      { id: 2, professional_id: 5, starts_at: "2026-11-17 09:00", ends_at: "2026-11-17 10:00", source: "manual" },
    ];
    const { ctl, state } = setup(base({
      [`GET ${G}/status`]: ok(statusData({ links: [link({ id: 2, role: "busy", professional_id: 5 })] })),
      "GET /time-blocks": ok(blocks),
    }));
    await ctl.load();
    expect(state.blocks.items.map((b) => b.id)).toEqual(["1", "3"]);
    expect(state.blocks.block.status).toBe("ready");
  });
  it("sem vínculo de leitura não busca bloqueios", async () => {
    const { ctl, count } = setup(base());
    await ctl.load();
    expect(count("GET /time-blocks")).toBe(0);
  });
  it("erro de rede vira bloco com erro", async () => {
    const { ctl, state } = setup(base({
      [`GET ${G}/status`]: ok(statusData({ links: [link({ id: 2, role: "busy" })] })),
      "GET /time-blocks": { network: true },
    }));
    await ctl.load();
    expect(state.blocks.block.status).toBe("error");
  });
});

describe("reset", () => {
  it("descarta respostas atrasadas depois de trocar de empresa", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { ctl, state } = setup(base({ [`GET ${G}/status`]: async () => { await gate; return ok(statusData()); } }));
    const p = ctl.load();
    ctl.reset();
    release();
    await p;
    expect(state.connected).toBe(false);
    expect(state.links).toEqual([]);
  });
});
