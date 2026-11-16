// Controlador da integração com o Instagram: estado e fluxos (status, painel, conexão OAuth, desconexão,
// atualização, links UTM). Puro: `api`, `state` e o ambiente (storage, navegação) são injetados.
//
// Regras:
//  - leituras automáticas (abrir a tela) usam suppressUpgradePrompt: um 402 vira bloco "locked" com convite,
//    sem abrir o modal global; ações do usuário (criar link, conectar) mantêm o modal global;
//  - Free não chama insights/conversão (o core responderia 402): os blocos já nascem "locked";
//  - cada bloco tem estado próprio (loading/ready/locked/error): um erro em um bloco não derruba os outros;
//  - reset() (logout/troca de empresa) invalida qualquer resposta que ainda esteja a caminho.
import { unwrap } from "./payloads.js";
import { classifyIntegrationError, blockState, blockFromError } from "./integrations.js";
import { createOauthFlow } from "./oauthFlow.js";
import {
  FREE_POSTS_LIMIT, IG_FEATURE, normalizeStatus, normalizeOverview, normalizePosts, normalizeInsights,
  normalizeConversion, normalizeUtmLink, buildUtmPayload, periodRange, connectionState,
} from "./instagram.js";

const BASE = "/integrations/instagram";
const PASSIVE = { suppressUpgradePrompt: true };
const BLOCKS = ["posts", "insights", "conversion", "links"];

export const DEFAULT_PERIOD_DAYS = 30;

export function initialState() {
  return {
    // unknown | yes | no  (no = core sem a F6: a interface esconde o recurso)
    available: "unknown",
    loaded: false,
    loading: false,
    connecting: false,
    disconnecting: false,
    refreshing: false,
    creatingLink: false,
    configured: true,
    connected: false,
    account: null,
    error: null, // { kind, message } quando o status em si falhou
    notice: null, // { kind: info|warning|error, message }
    premium: null, // null até o overview responder
    stale: false,
    engagement: null,
    posts: { items: [], nextBefore: "", limitTotal: null, stale: false },
    loadingMorePosts: false,
    insights: null,
    conversion: null,
    utmLinks: [],
    lastLink: null,
    days: DEFAULT_PERIOD_DAYS,
    blocks: Object.fromEntries(BLOCKS.map((b) => [b, blockState()])),
    callback: { status: "idle", message: "" }, // idle | working | done | error
  };
}

export function createInstagramController({
  api,
  state = initialState(),
  now = () => Date.now(),
  storage = null,
  origin = () => "",
  navigate = () => {},
  allowLocal = false,
  companyId = () => "",
} = {}) {
  let epoch = 0;
  let statusPromise = null;
  let dashboardPromise = null;
  const flow = createOauthFlow({ api, provider: "instagram", storage, origin, navigate, allowLocal, companyId, now });

  const setBlock = (name, next) => { state.blocks[name] = next; };
  const notice = (kind, message) => { state.notice = { kind, message }; };
  const classify = (error) => classifyIntegrationError(error, { provider: "instagram", now: now() });

  function reset() {
    epoch += 1;
    statusPromise = null;
    dashboardPromise = null;
    flow.reset();
    Object.assign(state, initialState());
  }

  // Resposta 409 *_reauth_required em qualquer chamada: a conta passa a pedir reconexão.
  function markReauth() {
    if (state.account) state.account = { ...state.account, status: "reauth_required" };
    state.connected = true;
  }

  // Erros comuns a qualquer bloco. Devolve true se já tratou (e o chamador não precisa fazer mais nada).
  function handleCommon(c) {
    if (c.kind === "reauth_required") { markReauth(); return true; }
    if (c.kind === "not_connected") { state.connected = false; state.account = null; return true; }
    return false;
  }

  // ---- Status ----------------------------------------------------------------

  function loadStatus({ force = false } = {}) {
    if (statusPromise && !force) return statusPromise;
    const my = epoch;
    state.loading = true;
    state.error = null;
    const run = (async () => {
      try {
        const response = await api.get(`${BASE}/status`, PASSIVE);
        if (my !== epoch) return;
        const status = normalizeStatus(unwrap(response));
        state.available = "yes";
        state.configured = status.configured;
        state.connected = status.connected;
        state.account = status.account;
      } catch (error) {
        if (my !== epoch) return;
        const c = classify(error);
        if (c.kind === "not_configured") {
          state.available = "yes";
          state.configured = false;
          state.connected = false;
          state.account = null;
        } else if (c.kind === "not_found") {
          state.available = "no"; // core sem a F6
        } else {
          state.error = { kind: c.kind, message: c.message };
        }
      } finally {
        if (my === epoch) {
          state.loaded = true;
          state.loading = false;
        }
      }
    })();
    statusPromise = run;
    run.finally(() => { if (statusPromise === run) statusPromise = null; });
    return run;
  }

  // ---- Painel ----------------------------------------------------------------

  async function loadOverview(my) {
    try {
      const response = await api.get(`${BASE}/overview`, PASSIVE);
      if (my !== epoch) return null;
      const overview = normalizeOverview(unwrap(response));
      if (overview.account) state.account = overview.account;
      state.engagement = overview.engagement;
      state.stale = overview.stale;
      state.premium = overview.premium;
      return overview;
    } catch (error) {
      if (my !== epoch) return null;
      const c = classify(error);
      if (!handleCommon(c)) notice(c.kind === "rate_limited" ? "warning" : "error", c.message);
      return null;
    }
  }

  async function loadPosts(my, { before = "" } = {}) {
    if (!before) setBlock("posts", blockState("loading"));
    try {
      const params = { limit: 12 };
      if (before) params.before = before;
      const response = await api.get(`${BASE}/posts`, { params, ...PASSIVE });
      if (my !== epoch) return;
      const page = normalizePosts(unwrap(response));
      state.posts = before
        ? { ...page, items: [...state.posts.items, ...page.items] }
        : page;
      setBlock("posts", blockState("ready"));
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      if (before) { notice("error", c.message); return; }
      if (!handleCommon(c)) setBlock("posts", blockFromError(c));
      else setBlock("posts", blockState("idle"));
    }
  }

  async function loadInsights(my, days = state.days) {
    setBlock("insights", blockState("loading"));
    try {
      const response = await api.get(`${BASE}/insights`, { params: { days }, ...PASSIVE });
      if (my !== epoch) return;
      state.insights = normalizeInsights(unwrap(response));
      setBlock("insights", blockState("ready"));
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      if (c.kind === "upgrade") state.premium = false;
      if (!handleCommon(c)) setBlock("insights", blockFromError(c));
      else setBlock("insights", blockState("idle"));
    }
  }

  async function loadConversion(my, days = state.days) {
    setBlock("conversion", blockState("loading"));
    try {
      const range = periodRange(days, now());
      const response = await api.get(`${BASE}/conversion`, { params: range, ...PASSIVE });
      if (my !== epoch) return;
      state.conversion = normalizeConversion(unwrap(response));
      setBlock("conversion", blockState("ready"));
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      if (c.kind === "upgrade") state.premium = false;
      if (!handleCommon(c)) setBlock("conversion", blockFromError(c));
      else setBlock("conversion", blockState("idle"));
    }
  }

  async function loadLinks(my) {
    setBlock("links", blockState("loading"));
    try {
      const response = await api.get(`${BASE}/utm-links`, PASSIVE);
      if (my !== epoch) return;
      const list = unwrap(response);
      state.utmLinks = (Array.isArray(list) ? list : []).map(normalizeUtmLink).filter((l) => l.id);
      setBlock("links", blockState("ready"));
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      if (!handleCommon(c)) setBlock("links", blockFromError(c));
      else setBlock("links", blockState("idle"));
    }
  }

  const lockedBlock = () => blockState("locked", { feature: IG_FEATURE });

  // Carrega o painel de uma conta conectada: overview e posts em paralelo; depois os blocos do Premium.
  function loadDashboard() {
    if (!state.connected) return Promise.resolve();
    if (dashboardPromise) return dashboardPromise;
    const my = epoch;
    const run = (async () => {
      const [overview] = await Promise.all([loadOverview(my), loadPosts(my), loadLinks(my)]);
      if (my !== epoch) return;
      if (!overview || state.account?.status === "reauth_required") return;
      if (overview.premium) {
        await Promise.all([loadInsights(my), loadConversion(my)]);
      } else {
        setBlock("insights", lockedBlock());
        setBlock("conversion", lockedBlock());
      }
    })();
    dashboardPromise = run;
    run.finally(() => { if (dashboardPromise === run) dashboardPromise = null; });
    return run;
  }

  // Abre a tela: status e, se conectado, o painel.
  async function load() {
    await loadStatus();
    if (state.available === "yes" && state.connected) await loadDashboard();
  }

  async function loadMorePosts() {
    const before = state.posts.nextBefore;
    if (!before || state.loadingMorePosts) return;
    if (state.premium === false) return; // Free: só os 6 mais recentes
    const my = epoch;
    state.loadingMorePosts = true;
    try {
      await loadPosts(my, { before });
    } finally {
      if (my === epoch) state.loadingMorePosts = false;
    }
  }

  // Muda o período das métricas (7/30/90 dias).
  async function setPeriod(days) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return;
    state.days = n;
    if (state.premium !== true) return;
    const my = epoch;
    await Promise.all([loadInsights(my, n), loadConversion(my, n)]);
  }

  // "Atualizar agora": POST /refresh (o core limita as consultas ao Instagram).
  async function refresh() {
    if (state.refreshing || !state.connected) return;
    const my = epoch;
    state.refreshing = true;
    state.notice = null;
    try {
      const response = await api.post(`${BASE}/refresh`, undefined, PASSIVE);
      if (my !== epoch) return;
      const overview = normalizeOverview(unwrap(response));
      if (overview.account) state.account = overview.account;
      state.engagement = overview.engagement;
      state.stale = overview.stale;
      state.premium = overview.premium;
      await Promise.all([
        loadPosts(my),
        overview.premium ? loadInsights(my) : Promise.resolve(),
        overview.premium ? loadConversion(my) : Promise.resolve(),
      ]);
      if (my === epoch) notice("info", "Dados atualizados.");
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      if (!handleCommon(c)) notice(c.kind === "rate_limited" ? "warning" : "error", c.message);
    } finally {
      if (my === epoch) state.refreshing = false;
    }
  }

  // ---- Conexão ---------------------------------------------------------------

  async function connect() {
    if (state.connecting) return { ok: false, kind: "busy" };
    state.connecting = true;
    state.notice = null;
    const result = await flow.connect();
    if (!result.ok) {
      state.connecting = false; // com sucesso a página sai para o provedor
      notice("error", result.message);
    }
    return result;
  }

  // Retorno do provedor (página /oauth/instagram).
  async function completeCallback(query) {
    state.callback = { status: "working", message: "" };
    const my = epoch;
    const result = await flow.complete(query);
    if (my !== epoch) return result;
    if (result.ok) {
      const status = normalizeStatus(result.data);
      state.available = "yes";
      state.configured = status.configured;
      state.connected = status.connected;
      state.account = status.account;
      state.loaded = true;
      state.connecting = false;
      state.callback = { status: "done", message: "Instagram conectado." };
      dashboardPromise = null;
    } else {
      state.connecting = false;
      state.callback = { status: "error", message: result.message };
    }
    return result;
  }

  // Desconectar (LGPD): apaga a conexão e os dados em cache no core. 404 not_connected = já estava desconectado.
  async function disconnect() {
    if (state.disconnecting) return { ok: false, kind: "busy" };
    const my = epoch;
    state.disconnecting = true;
    state.notice = null;
    try {
      await api.post(`${BASE}/disconnect`);
    } catch (error) {
      const c = classify(error);
      if (c.kind !== "not_connected") {
        if (my === epoch) { notice("error", c.message); state.disconnecting = false; }
        return { ok: false, kind: c.kind, message: c.message };
      }
    }
    if (my !== epoch) return { ok: true };
    const keep = { available: state.available, loaded: true, configured: state.configured };
    Object.assign(state, initialState(), keep);
    flow.reset();
    notice("info", "Instagram desconectado. Os dados da conta foram removidos do AgendasPRO.");
    return { ok: true };
  }

  // ---- Links UTM -------------------------------------------------------------

  // Ação do usuário: um 402 abre o modal global de upgrade (post/story/campanha são Premium).
  async function createLink(form) {
    if (state.creatingLink) return { ok: false, kind: "busy" };
    const built = buildUtmPayload(form, { premium: state.premium === true });
    if (!built.ok) return { ok: false, kind: built.locked ? "locked" : "validation", errors: built.errors || {}, message: built.message || "" };
    const my = epoch;
    state.creatingLink = true;
    try {
      const response = await api.post(`${BASE}/utm-link`, built.payload);
      if (my !== epoch) return { ok: false, kind: "stale" };
      const link = normalizeUtmLink(unwrap(response));
      state.lastLink = link;
      if (link.id) state.utmLinks = [link, ...state.utmLinks.filter((l) => l.id !== link.id)];
      return { ok: true, link };
    } catch (error) {
      if (my !== epoch) return { ok: false, kind: "stale" };
      const c = classify(error);
      if (c.kind === "upgrade") state.premium = false;
      handleCommon(c);
      return { ok: false, kind: c.kind, message: c.message, handledGlobally: c.handledGlobally };
    } finally {
      if (my === epoch) state.creatingLink = false;
    }
  }

  const view = () => connectionState({
    loaded: state.loaded, loading: state.loading && !state.loaded, connecting: state.connecting,
    configured: state.configured, connected: state.connected, account: state.account, error: !!state.error,
  });

  return {
    state, reset, load, loadStatus, loadDashboard, loadMorePosts, setPeriod, refresh,
    connect, completeCallback, disconnect, createLink, view,
    clearNotice: () => { state.notice = null; },
    FREE_POSTS_LIMIT,
  };
}
