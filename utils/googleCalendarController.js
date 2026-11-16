// Controlador da integração com o Google Agenda: conexão OAuth, vínculos (push/busy), sincronização manual
// e bloqueios importados. Puro: `api`, `state` e o ambiente (storage, navegação) são injetados.
//
// Regras:
//  - desconectar funciona em qualquer plano (inclusive depois de cair para o Free); o resto exige Premium;
//  - leituras automáticas usam suppressUpgradePrompt; ações do usuário (conectar, vincular, sincronizar) mantêm
//    o modal global de upgrade em caso de 402;
//  - o plano é lido de /billing/subscription só para decidir o que mostrar (o core continua sendo a autoridade);
//  - a exportação para o Google roda a cada hora: PUSH_LATENCY_NOTE explica e "Sincronizar agora" antecipa.
import { unwrap } from "./payloads.js";
import { classifyIntegrationError, blockState, blockFromError } from "./integrations.js";
import { createOauthFlow } from "./oauthFlow.js";
import {
  GCAL_FEATURE, normalizeStatus, normalizeLink, normalizeCalendars, buildLinkPayload, googleBlocks, connectionState,
} from "./googleCalendar.js";

const BASE = "/integrations/google-calendar";
const PASSIVE = { suppressUpgradePrompt: true };

export function initialState() {
  return {
    available: "unknown", // unknown | yes | no (no = core sem a F6)
    loaded: false,
    loading: false,
    connecting: false,
    disconnecting: false,
    syncing: false,
    savingLink: false,
    removingLinkId: "",
    configured: true,
    connected: false,
    account: null,
    links: [],
    error: null,
    notice: null, // { kind: info|warning|error, message }
    premium: null, // null = desconhecido
    calendars: { items: [], block: blockState() },
    professionals: [],
    blocks: { items: [], block: blockState() },
    syncCooldownUntil: 0,
    callback: { status: "idle", message: "" },
  };
}

export function createGoogleCalendarController({
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
  const flow = createOauthFlow({ api, provider: "google", storage, origin, navigate, allowLocal, companyId, now });

  const notice = (kind, message) => { state.notice = { kind, message }; };
  const classify = (error) => classifyIntegrationError(error, { provider: "google", now: now() });

  function reset() {
    epoch += 1;
    statusPromise = null;
    flow.reset();
    Object.assign(state, initialState());
  }

  function markReauth() {
    if (state.account) state.account = { ...state.account, status: "reauth_required" };
    state.connected = true;
  }

  function handleCommon(c) {
    if (c.kind === "reauth_required") { markReauth(); return true; }
    if (c.kind === "not_connected") {
      state.connected = false; state.account = null; state.links = []; return true;
    }
    if (c.kind === "upgrade") { state.premium = false; return false; }
    return false;
  }

  // ---- Plano (só para decidir a interface) -------------------------------------
  async function loadPlan() {
    const my = epoch;
    try {
      const response = await api.get("/billing/subscription", PASSIVE);
      if (my !== epoch) return;
      const data = unwrap(response) || {};
      const code = data.entitlement && data.entitlement.plan_code;
      if (typeof code === "string" && code) state.premium = code !== "free";
    } catch {
      // desconhecido: a tela não bloqueia nada antes de o core responder
    }
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
        state.links = status.links;
      } catch (error) {
        if (my !== epoch) return;
        const c = classify(error);
        if (c.kind === "not_configured") {
          state.available = "yes";
          state.configured = false;
          state.connected = false;
          state.account = null;
          state.links = [];
        } else if (c.kind === "not_found") {
          state.available = "no";
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

  // ---- Listas ----------------------------------------------------------------
  // Calendários do Google (admin + Premium). Chamado sob demanda ao abrir o formulário de vínculo.
  async function loadCalendars() {
    if (state.premium === false) {
      state.calendars = { items: [], block: blockState("locked", { feature: GCAL_FEATURE }) };
      return;
    }
    const my = epoch;
    state.calendars = { items: state.calendars.items, block: blockState("loading") };
    try {
      const response = await api.get(`${BASE}/calendars`, PASSIVE);
      if (my !== epoch) return;
      state.calendars = { items: normalizeCalendars(unwrap(response)), block: blockState("ready") };
    } catch (error) {
      if (my !== epoch) return;
      const c = classify(error);
      const handled = handleCommon(c);
      state.calendars = { items: [], block: handled && c.kind !== "reauth_required" ? blockState("idle") : blockFromError(c) };
    }
  }

  async function loadProfessionals() {
    const my = epoch;
    try {
      const response = await api.get("/professionals", { params: { include_inactive: true } });
      if (my !== epoch) return;
      const list = unwrap(response);
      state.professionals = Array.isArray(list) ? list : [];
    } catch {
      // os nomes caem para "Profissional #id"
    }
  }

  // Bloqueios importados (somente leitura): próximos 90 dias.
  async function loadBlocks() {
    const my = epoch;
    state.blocks = { items: state.blocks.items, block: blockState("loading") };
    try {
      const from = new Date(now());
      const to = new Date(now() + 90 * 86400000);
      const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const response = await api.get("/time-blocks", { params: { from: `${day(from)} 00:00`, to: `${day(to)} 23:59` } });
      if (my !== epoch) return;
      state.blocks = { items: googleBlocks(unwrap(response)), block: blockState("ready") };
    } catch (error) {
      if (my !== epoch) return;
      state.blocks = { items: [], block: blockFromError(classify(error)) };
    }
  }

  // Abre a tela: status e plano; se conectado, vínculos, profissionais e bloqueios.
  async function load() {
    await Promise.all([loadStatus(), loadPlan()]);
    if (state.available === "yes" && state.connected) {
      await Promise.all([loadProfessionals(), state.links.some((l) => l.role === "busy") ? loadBlocks() : Promise.resolve()]);
    }
  }

  // ---- Conexão ---------------------------------------------------------------
  async function connect() {
    if (state.connecting) return { ok: false, kind: "busy" };
    state.connecting = true;
    state.notice = null;
    const result = await flow.connect();
    if (!result.ok) {
      state.connecting = false;
      if (result.kind === "upgrade") state.premium = false;
      if (!(result.classified && result.classified.handledGlobally)) notice("error", result.message);
    }
    return result;
  }

  async function completeCallback(query) {
    state.callback = { status: "working", message: "" };
    const my = epoch;
    const result = await flow.complete(query);
    if (my !== epoch) return result;
    state.connecting = false;
    if (result.ok) {
      const status = normalizeStatus(result.data);
      state.available = "yes";
      state.configured = status.configured;
      state.connected = status.connected;
      state.account = status.account;
      state.links = status.links;
      state.loaded = true;
      state.callback = { status: "done", message: "Google Agenda conectado." };
    } else {
      state.callback = { status: "error", message: result.message };
    }
    return result;
  }

  // Funciona em qualquer plano. removeAppCalendars apaga também os calendários criados pelo app no Google.
  async function disconnect({ removeAppCalendars = false } = {}) {
    if (state.disconnecting) return { ok: false, kind: "busy" };
    const my = epoch;
    state.disconnecting = true;
    state.notice = null;
    let removed = 0;
    try {
      const response = await api.post(`${BASE}/disconnect`, { remove_app_calendars: !!removeAppCalendars });
      const data = unwrap(response) || {};
      removed = Number(data.removed_calendars) || 0;
    } catch (error) {
      const c = classify(error);
      if (c.kind !== "not_connected") {
        if (my === epoch) { notice("error", c.message); state.disconnecting = false; }
        return { ok: false, kind: c.kind, message: c.message };
      }
    }
    if (my !== epoch) return { ok: true };
    const keep = { available: state.available, loaded: true, configured: state.configured, premium: state.premium };
    Object.assign(state, initialState(), keep);
    flow.reset();
    notice("info", removeAppCalendars && removed
      ? "Google Agenda desconectado. Os calendários criados pelo AgendasPRO foram apagados no Google."
      : "Google Agenda desconectado. Os eventos já exportados continuam na sua agenda do Google.");
    return { ok: true, removedCalendars: removed };
  }

  // ---- Vínculos --------------------------------------------------------------
  async function createLink(form) {
    if (state.savingLink) return { ok: false, kind: "busy" };
    const built = buildLinkPayload(form, { calendars: state.calendars.items, links: state.links });
    if (!built.ok) return { ok: false, kind: "validation", errors: built.errors };
    const my = epoch;
    state.savingLink = true;
    try {
      const response = await api.post(`${BASE}/links`, built.payload);
      if (my !== epoch) return { ok: false, kind: "stale" };
      const link = normalizeLink(unwrap(response));
      if (link.id) state.links = [...state.links.filter((l) => l.id !== link.id), link];
      else await loadStatus({ force: true });
      if (link.role === "busy") loadBlocks();
      return { ok: true, link };
    } catch (error) {
      if (my !== epoch) return { ok: false, kind: "stale" };
      const c = classify(error);
      handleCommon(c);
      return { ok: false, kind: c.kind, message: c.message, handledGlobally: c.handledGlobally };
    } finally {
      if (my === epoch) state.savingLink = false;
    }
  }

  async function deleteLink(id) {
    if (state.removingLinkId) return { ok: false, kind: "busy" };
    const link = state.links.find((l) => l.id === String(id));
    const my = epoch;
    state.removingLinkId = String(id);
    try {
      await api.delete(`${BASE}/links/${encodeURIComponent(id)}`);
    } catch (error) {
      const c = classify(error);
      if (c.kind !== "not_found") {
        if (my === epoch) { state.removingLinkId = ""; notice("error", c.message); }
        return { ok: false, kind: c.kind, message: c.message };
      }
    }
    if (my !== epoch) return { ok: true };
    state.removingLinkId = "";
    state.links = state.links.filter((l) => l.id !== String(id));
    if (link && link.role === "busy") loadBlocks();
    return { ok: true };
  }

  // ---- Sincronização manual ----------------------------------------------------
  async function syncNow() {
    if (state.syncing) return { ok: false, kind: "busy" };
    if (state.syncCooldownUntil > now()) return { ok: false, kind: "rate_limited" };
    const my = epoch;
    state.syncing = true;
    state.notice = null;
    try {
      await api.post(`${BASE}/sync`);
      if (my !== epoch) return { ok: true };
      notice("info", "Sincronização solicitada. Os agendamentos chegam ao Google em instantes.");
      return { ok: true };
    } catch (error) {
      if (my !== epoch) return { ok: false, kind: "stale" };
      const c = classify(error);
      if (c.kind === "rate_limited") {
        const t = c.retryAt ? Date.parse(c.retryAt) : NaN;
        state.syncCooldownUntil = Number.isFinite(t) ? t : now() + 10 * 60000;
        notice("warning", c.message);
      } else if (!handleCommon(c)) {
        if (!c.handledGlobally) notice("error", c.message);
      }
      return { ok: false, kind: c.kind, message: c.message };
    } finally {
      if (my === epoch) state.syncing = false;
    }
  }

  const view = () => connectionState({
    loaded: state.loaded, loading: state.loading && !state.loaded, connecting: state.connecting,
    configured: state.configured, connected: state.connected, account: state.account, error: !!state.error,
  });

  return {
    state, reset, load, loadStatus, loadCalendars, loadProfessionals, loadBlocks,
    connect, completeCallback, disconnect, createLink, deleteLink, syncNow, view,
    clearNotice: () => { state.notice = null; },
  };
}
