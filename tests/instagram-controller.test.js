import { describe, it, expect, vi } from "vitest";
import { createInstagramController, initialState } from "../utils/instagramController.js";
import { savePending, readPending } from "../utils/oauth.js";
import { fakeApi, memoryStorage, err, ok } from "./helpers/fakeApi.js";

const B = "/integrations/instagram";
const account = (over = {}) => ({ ig_user_id: "1", username: "studio", followers_count: 1200, media_count: 40, status: "active", ...over });
const post = (id) => ({ media_id: id, caption: `Post ${id}`, media_type: "IMAGE", permalink: `https://www.instagram.com/p/${id}/`, like_count: 3, comments_count: 1 });

function setup(handlers, { storage = memoryStorage(), allowLocal = false } = {}) {
  const fake = fakeApi(handlers);
  const navigate = vi.fn();
  const ctl = createInstagramController({
    api: fake.api, state: initialState(), now: () => Date.parse("2026-11-16T12:00:00Z"),
    storage, origin: () => "https://app.test", navigate, allowLocal, companyId: () => "7",
  });
  return { ctl, state: ctl.state, navigate, storage, ...fake };
}

const connectedFree = () => ({
  [`GET ${B}/status`]: ok({ configured: true, connected: true, account: account() }),
  [`GET ${B}/overview`]: ok({ account: account(), engagement: { engagement_rate: 0.05, engagement_basis: "reach", posts_considered: 3 }, stale: false, premium: false }),
  [`GET ${B}/posts`]: ok({ items: [post("1"), post("2")], next_before: "2", limit_total: 6, stale: false }),
  [`GET ${B}/utm-links`]: ok([]),
});
const connectedPremium = () => ({
  ...connectedFree(),
  [`GET ${B}/overview`]: ok({ account: account(), engagement: null, stale: false, premium: true }),
  [`GET ${B}/insights`]: ok({ account_insights: { period_days: 30, reach: 900 }, posts: [], history: [] }),
  [`GET ${B}/conversion`]: ok({ period: { from: "2026-10-18", to: "2026-11-16" }, totals: { visits: 10, bookings: 2 }, by_campaign: [] }),
});

describe("status", () => {
  it("503 integration_not_configured vira estado indisponível sem erro", async () => {
    const { ctl, state } = setup({ [`GET ${B}/status`]: err(503, "integration_not_configured") });
    await ctl.load();
    expect(state.configured).toBe(false);
    expect(state.available).toBe("yes");
    expect(ctl.view()).toBe("not_configured");
  });
  it("404 sem código: o core não tem a F6, a interface some", async () => {
    const { ctl, state } = setup({ [`GET ${B}/status`]: { status: 404, data: { message: "nope" } } });
    await ctl.load();
    expect(state.available).toBe("no");
  });
  it("erro de rede: estado de erro e nova tentativa permitida", async () => {
    let n = 0;
    const { ctl, state } = setup({ [`GET ${B}/status`]: () => (++n === 1 ? { network: true } : ok({ configured: true, connected: false, account: null })) });
    await ctl.load();
    expect(ctl.view()).toBe("error");
    expect(state.error.kind).toBe("network");
    await ctl.loadStatus({ force: true });
    expect(ctl.view()).toBe("disconnected");
  });
  it("desconectado não chama o painel", async () => {
    const { ctl, calls } = setup({ [`GET ${B}/status`]: ok({ configured: true, connected: false, account: null }) });
    await ctl.load();
    expect(calls.map((c) => c.key)).toEqual([`GET ${B}/status`]);
  });
  it("chamadas simultâneas de status reaproveitam a mesma requisição", async () => {
    const { ctl, count } = setup({ [`GET ${B}/status`]: ok({ configured: true, connected: false, account: null }) });
    await Promise.all([ctl.loadStatus(), ctl.loadStatus()]);
    expect(count(`GET ${B}/status`)).toBe(1);
  });
});

describe("painel", () => {
  it("Free: perfil e posts; insights e conversão bloqueados sem chamar o core", async () => {
    const { ctl, state, calls } = setup(connectedFree());
    await ctl.load();
    expect(ctl.view()).toBe("connected");
    expect(state.premium).toBe(false);
    expect(state.posts.items).toHaveLength(2);
    expect(state.blocks.insights.status).toBe("locked");
    expect(state.blocks.conversion.status).toBe("locked");
    expect(calls.some((c) => /insights|conversion/.test(c.key))).toBe(false);
    // leituras automáticas nunca abrem o modal global
    expect(calls.every((c) => c.suppress)).toBe(true);
  });
  it("Premium: carrega insights e conversão com o período", async () => {
    const { ctl, state, calls } = setup(connectedPremium());
    await ctl.load();
    expect(state.premium).toBe(true);
    expect(state.blocks.insights.status).toBe("ready");
    expect(state.insights.account.reach).toBe(900);
    expect(state.conversion.totals.visits).toBe(10);
    const conv = calls.find((c) => c.key === `GET ${B}/conversion`);
    expect(conv.params).toEqual({ from: "2026-10-18", to: "2026-11-16" });
  });
  it("trocar o período recarrega só no Premium", async () => {
    const free = setup(connectedFree());
    await free.ctl.load();
    await free.ctl.setPeriod(7);
    expect(free.calls.some((c) => c.key === `GET ${B}/insights`)).toBe(false);
    const prem = setup(connectedPremium());
    await prem.ctl.load();
    await prem.ctl.setPeriod(7);
    const last = prem.calls.filter((c) => c.key === `GET ${B}/insights`).pop();
    expect(last.params).toEqual({ days: 7 });
    await prem.ctl.setPeriod(0);
    expect(prem.state.days).toBe(7);
  });
  it("409 reauth no overview: pede reconexão e não carrega o Premium", async () => {
    const { ctl, calls } = setup({ ...connectedPremium(), [`GET ${B}/overview`]: err(409, "instagram_reauth_required") });
    await ctl.load();
    expect(ctl.view()).toBe("reauth_required");
    expect(calls.some((c) => /insights|conversion/.test(c.key))).toBe(false);
  });
  it("402 inesperado em insights vira bloco bloqueado (não erro) e marca Free", async () => {
    const { ctl, state } = setup({ ...connectedPremium(), [`GET ${B}/insights`]: err(402, "plan_upgrade_required", { feature: "instagram", plan: "free" }) });
    await ctl.load();
    expect(state.blocks.insights.status).toBe("locked");
    expect(state.premium).toBe(false);
    expect(state.blocks.conversion.status).toBe("ready");
  });
  it("erro de um bloco não derruba os outros", async () => {
    const { ctl, state } = setup({ ...connectedPremium(), [`GET ${B}/posts`]: err(502, "instagram_unavailable") });
    await ctl.load();
    expect(state.blocks.posts.status).toBe("error");
    expect(state.blocks.insights.status).toBe("ready");
    expect(ctl.view()).toBe("connected");
  });
  it("429 no overview mostra aviso com o horário", async () => {
    const { ctl, state } = setup({ ...connectedFree(), [`GET ${B}/overview`]: err(429, "instagram_rate_limited", { retry_at: "2026-11-16T15:30:00Z" }) });
    await ctl.load();
    expect(state.notice.kind).toBe("warning");
    expect(state.notice.message).toContain("limitou");
  });
  it("mais posts: acrescenta; no Free não pagina", async () => {
    const handlers = connectedPremium();
    let n = 0;
    handlers[`GET ${B}/posts`] = (config) => (config.params && config.params.before ? ok({ items: [post("3")], next_before: "", limit_total: null }) : (n++, ok({ items: [post("1"), post("2")], next_before: "2", limit_total: null })));
    const { ctl, state } = setup(handlers);
    await ctl.load();
    await ctl.loadMorePosts();
    expect(state.posts.items.map((p) => p.id)).toEqual(["1", "2", "3"]);
    const free = setup(connectedFree());
    await free.ctl.load();
    await free.ctl.loadMorePosts();
    expect(free.count(`GET ${B}/posts`)).toBe(1);
  });
  it("reset durante a carga descarta a resposta atrasada", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const handlers = { ...connectedFree(), [`GET ${B}/status`]: async () => { await gate; return ok({ configured: true, connected: true, account: account() }); } };
    const { ctl, state } = setup(handlers);
    const p = ctl.load();
    ctl.reset();
    release();
    await p;
    expect(state.connected).toBe(false);
    expect(state.loaded).toBe(false);
  });
});

describe("refresh", () => {
  it("atualiza e recarrega os blocos", async () => {
    const h = connectedPremium();
    h[`POST ${B}/refresh`] = ok({ account: account(), engagement: null, stale: false, premium: true });
    const { ctl, state, count } = setup(h);
    await ctl.load();
    await ctl.refresh();
    expect(count(`POST ${B}/refresh`)).toBe(1);
    expect(count(`GET ${B}/posts`)).toBe(2);
    expect(state.notice.kind).toBe("info");
    expect(state.refreshing).toBe(false);
  });
  it("429: aviso e sem recarregar", async () => {
    const h = connectedFree();
    h[`POST ${B}/refresh`] = err(429, "instagram_rate_limited", { retry_at: "2026-11-16T15:30:00Z" });
    const { ctl, state, count } = setup(h);
    await ctl.load();
    await ctl.refresh();
    expect(state.notice.kind).toBe("warning");
    expect(count(`GET ${B}/posts`)).toBe(1);
  });
});

describe("conexão OAuth", () => {
  const start = (over = {}) => ok({ authorize_url: "https://www.instagram.com/oauth/authorize?x=1", state: "st1", redirect_uri: "https://app.test/oauth/instagram", expires_in: 600, ...over });

  it("envia a redirect_uri do painel, guarda o pedido e navega para o provedor", async () => {
    const { ctl, navigate, storage, calls } = setup({ [`POST ${B}/connect/start`]: start() });
    const r = await ctl.connect();
    expect(r.ok).toBe(true);
    expect(calls[0].body).toEqual({ redirect_uri: "https://app.test/oauth/instagram" });
    expect(navigate).toHaveBeenCalledWith("https://www.instagram.com/oauth/authorize?x=1");
    expect(readPending(storage, "instagram")).toMatchObject({ state: "st1", companyId: "7" });
  });
  it("recusa authorize_url de outro domínio e javascript:", async () => {
    for (const url of ["https://evil.example/login", "javascript:alert(1)", "http://www.instagram.com/x"]) {
      const { ctl, navigate, state } = setup({ [`POST ${B}/connect/start`]: start({ authorize_url: url }) });
      const r = await ctl.connect();
      expect(r.ok).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(state.connecting).toBe(false);
      expect(state.notice.kind).toBe("error");
    }
  });
  it("http local só em desenvolvimento (mock)", async () => {
    const url = "http://localhost:4010/mock-oauth";
    const dev = setup({ [`POST ${B}/connect/start`]: start({ authorize_url: url }) }, { allowLocal: true });
    expect((await dev.ctl.connect()).ok).toBe(true);
    const prod = setup({ [`POST ${B}/connect/start`]: start({ authorize_url: url }) });
    expect((await prod.ctl.connect()).ok).toBe(false);
  });
  it.each([
    [403, "admin_required", "administradores"],
    [503, "integration_not_configured", "configurado"],
    [400, "redirect_uri_not_allowed", "não está autorizado"],
  ])("erro %s %s vira mensagem amigável e libera o botão", async (status, code, text) => {
    const { ctl, state } = setup({ [`POST ${B}/connect/start`]: err(status, code) });
    const r = await ctl.connect();
    expect(r.ok).toBe(false);
    expect(state.notice.message).toContain(text);
    expect(state.connecting).toBe(false);
  });
});

describe("retorno do OAuth (callback)", () => {
  const done = ok({ configured: true, connected: true, account: account() });

  it("conclui uma vez, mesmo com montagem dupla da página", async () => {
    const storage = memoryStorage();
    savePending(storage, "instagram", { state: "st1", companyId: "7", now: Date.parse("2026-11-16T11:55:00Z") });
    const { ctl, state, count } = setup({ [`POST ${B}/callback`]: done }, { storage });
    const q = { code: "abc#_", state: "st1" };
    const [a, b] = await Promise.all([ctl.completeCallback(q), ctl.completeCallback(q)]);
    expect(a.ok && b.ok).toBe(true);
    expect(count(`POST ${B}/callback`)).toBe(1);
    expect(state.connected).toBe(true);
    expect(state.callback.status).toBe("done");
    expect(readPending(storage, "instagram")).toBeNull();
  });
  it("remove o #_ do code antes de enviar", async () => {
    const { ctl, calls } = setup({ [`POST ${B}/callback`]: done });
    await ctl.completeCallback({ code: "abc#_", state: "s" });
    expect(calls[0].body).toEqual({ code: "abc", state: "s" });
  });
  it("state diferente do pedido guardado: não chama o core", async () => {
    const storage = memoryStorage();
    savePending(storage, "instagram", { state: "outro", companyId: "7", now: Date.parse("2026-11-16T11:55:00Z") });
    const { ctl, state, count } = setup({ [`POST ${B}/callback`]: done }, { storage });
    const r = await ctl.completeCallback({ code: "c", state: "st1" });
    expect(r.ok).toBe(false);
    expect(count(`POST ${B}/callback`)).toBe(0);
    expect(state.callback.status).toBe("error");
  });
  it("pedido expirado (mais de 15 min) ou de outra empresa é recusado", async () => {
    const old = memoryStorage();
    savePending(old, "instagram", { state: "s", companyId: "7", now: Date.parse("2026-11-16T11:00:00Z") });
    const a = setup({ [`POST ${B}/callback`]: done }, { storage: old });
    expect((await a.ctl.completeCallback({ code: "c", state: "s" })).kind).toBe("state_mismatch");
    const other = memoryStorage();
    savePending(other, "instagram", { state: "s", companyId: "9", now: Date.parse("2026-11-16T11:59:00Z") });
    const b = setup({ [`POST ${B}/callback`]: done }, { storage: other });
    expect((await b.ctl.completeCallback({ code: "c", state: "s" })).kind).toBe("state_mismatch");
  });
  it("usuário negou: mensagem sem texto cru da URL", async () => {
    const { ctl, state, count } = setup({ [`POST ${B}/callback`]: done });
    const r = await ctl.completeCallback({ error: "access_denied", error_description: "<script>alert(1)</script>" });
    expect(r.kind).toBe("denied");
    expect(state.callback.message).toContain("cancelada");
    expect(state.callback.message).not.toContain("script");
    expect(count(`POST ${B}/callback`)).toBe(0);
  });
  it("sem parâmetros: nada a concluir", async () => {
    const { ctl } = setup({});
    expect((await ctl.completeCallback({})).kind).toBe("none");
  });
  it.each([
    [400, "oauth_state_invalid", "expirou ou já foi usado"],
    [502, "instagram_oauth_failed", "Não foi possível concluir"],
    [429, "instagram_rate_limited", "limitou"],
    [503, "integration_not_configured", "configurado"],
  ])("erro %s %s", async (status, code, text) => {
    const { ctl, state } = setup({ [`POST ${B}/callback`]: err(status, code) });
    const r = await ctl.completeCallback({ code: "c", state: "s" });
    expect(r.ok).toBe(false);
    expect(state.callback.message).toContain(text);
    expect(state.connected).toBe(false);
  });
  it("o resultado de um state com falha não é reenviado ao recarregar a mesma query", async () => {
    const { ctl, count } = setup({ [`POST ${B}/callback`]: err(400, "oauth_state_invalid") });
    await ctl.completeCallback({ code: "c", state: "s" });
    await ctl.completeCallback({ code: "c", state: "s" });
    expect(count(`POST ${B}/callback`)).toBe(1);
  });
});

describe("desconectar (LGPD)", () => {
  it("limpa o estado local e avisa; sem 402 modal (ação sem plano)", async () => {
    const h = connectedPremium();
    h[`POST ${B}/disconnect`] = ok({ disconnected: true });
    const { ctl, state } = setup(h);
    await ctl.load();
    const r = await ctl.disconnect();
    expect(r.ok).toBe(true);
    expect(state.connected).toBe(false);
    expect(state.account).toBeNull();
    expect(state.insights).toBeNull();
    expect(state.posts.items).toEqual([]);
    expect(ctl.view()).toBe("disconnected");
    expect(state.notice.message).toContain("removidos");
  });
  it("404 not_connected: já estava desconectado, tratado como sucesso", async () => {
    const h = connectedFree();
    h[`POST ${B}/disconnect`] = err(404, "integration_not_connected");
    const { ctl, state } = setup(h);
    await ctl.load();
    expect((await ctl.disconnect()).ok).toBe(true);
    expect(state.connected).toBe(false);
  });
  it("falha de rede: continua conectado e mostra o erro", async () => {
    const h = connectedFree();
    h[`POST ${B}/disconnect`] = { network: true };
    const { ctl, state } = setup(h);
    await ctl.load();
    const r = await ctl.disconnect();
    expect(r.ok).toBe(false);
    expect(state.connected).toBe(true);
    expect(state.disconnecting).toBe(false);
    expect(state.notice.kind).toBe("error");
  });
});

describe("links UTM", () => {
  it("bio no Free: cria e entra no topo da lista", async () => {
    const h = connectedFree();
    h[`POST ${B}/utm-link`] = ok({ id: 5, label: "Meu link", utm_source: "instagram", utm_medium: "bio", utm_campaign: "perfil", url: "https://app.test/b/x?utm_source=instagram", public_page_ready: true }, 201);
    const { ctl, state, calls } = setup(h);
    await ctl.load();
    const r = await ctl.createLink({ placement: "bio", label: "Meu link" });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.key === `POST ${B}/utm-link`).body).toEqual({ placement: "bio", label: "Meu link" });
    expect(state.utmLinks[0].id).toBe(5);
    expect(state.lastLink.url).toContain("utm_source");
  });
  it("post no Free: bloqueado antes da chamada", async () => {
    const { ctl, count } = setup(connectedFree());
    await ctl.load();
    const r = await ctl.createLink({ placement: "post", content: "promo" });
    expect(r.kind).toBe("locked");
    expect(count(`POST ${B}/utm-link`)).toBe(0);
  });
  it("Premium: validação local antes de enviar", async () => {
    const { ctl, count } = setup(connectedPremium());
    await ctl.load();
    const r = await ctl.createLink({ placement: "campaign", campaign: "" });
    expect(r.kind).toBe("validation");
    expect(r.errors.campaign).toBeTruthy();
    expect(count(`POST ${B}/utm-link`)).toBe(0);
  });
  it("402 do core numa ação do usuário não é suprimido (o modal global decide)", async () => {
    const h = connectedPremium();
    h[`POST ${B}/utm-link`] = err(402, "plan_upgrade_required", { feature: "instagram", plan: "free" });
    const { ctl, state, calls } = setup(h);
    await ctl.load();
    const r = await ctl.createLink({ placement: "story", content: "x" });
    expect(r.kind).toBe("upgrade");
    expect(calls.find((c) => c.key === `POST ${B}/utm-link`).suppress).toBe(false);
    expect(state.premium).toBe(false);
  });
  it("clique duplo não envia duas vezes", async () => {
    const h = connectedFree();
    h[`POST ${B}/utm-link`] = ok({ id: 1, utm_medium: "bio", url: "https://app.test/b/x" }, 201);
    const { ctl, count } = setup(h);
    await ctl.load();
    await Promise.all([ctl.createLink({ placement: "bio" }), ctl.createLink({ placement: "bio" })]);
    expect(count(`POST ${B}/utm-link`)).toBe(1);
  });
});
