// Integração com o Google Agenda (F6): normalização, vínculos (push/busy), validação do formulário de vínculo
// e textos de status. Puro. Eventos e calendários vêm do Google: sempre texto puro.
import { cleanText } from "./safeText.js";
import { relativeTime } from "./integrations.js";

export const GCAL_FEATURE = "google_calendar";

export const ROLE_LABELS = {
  push: "Exportar agendamentos",
  busy: "Importar horários ocupados",
};

const str = (v, max = 200) => (typeof v === "string" ? cleanText(v, max).trim() : "");

export function normalizeAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    email: str(raw.email, 200),
    status: raw.status === "reauth_required" ? "reauth_required" : "active",
    scopes: Array.isArray(raw.scopes) ? raw.scopes.filter((s) => typeof s === "string") : [],
    connectedAt: str(raw.connected_at, 40),
    lastPushAt: str(raw.last_push_at, 40),
    lastErrorCode: str(raw.last_error_code, 80),
  };
}

export function normalizeLink(raw) {
  const l = raw && typeof raw === "object" ? raw : {};
  return {
    id: l.id === null || l.id === undefined ? "" : String(l.id),
    role: l.role === "busy" ? "busy" : "push",
    professionalId: l.professional_id === null || l.professional_id === undefined || l.professional_id === "" ? null : String(l.professional_id),
    calendarId: str(l.calendar_id, 300),
    calendarSummary: str(l.calendar_summary, 200),
    createdByApp: l.created_by_app === true,
    lastSyncAt: str(l.last_sync_at, 40),
    lastFullSyncAt: str(l.last_full_sync_at, 40),
    pushChannelActive: l.push_channel_active === true,
  };
}

export function normalizeLinks(raw) {
  return Array.isArray(raw) ? raw.map(normalizeLink).filter((l) => l.id) : [];
}

export function normalizeStatus(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    configured: d.configured !== false,
    connected: !!d.connected,
    account: normalizeAccount(d.account),
    links: normalizeLinks(d.links),
  };
}

export function normalizeCalendars(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && c.id)
    .map((c) => ({
      id: c.id,
      summary: str(c.summary, 200) || c.id,
      primary: c.primary === true,
      accessRole: str(c.access_role, 30),
      timeZone: str(c.time_zone, 60),
      writable: c.access_role === "owner" || c.access_role === "writer",
    }));
}

export function connectionState({ loaded, loading, connecting, configured, connected, account, error } = {}) {
  if (connecting) return "connecting";
  if (error && !connected) return "error";
  if (!loaded || loading) return "loading";
  if (configured === false) return "not_configured";
  if (!connected) return "disconnected";
  if (account && account.status === "reauth_required") return "reauth_required";
  return "connected";
}

export function groupLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return { push: list.filter((l) => l.role === "push"), busy: list.filter((l) => l.role === "busy") };
}

// Para quem o vínculo vale: "Todos os demais profissionais" (push padrão), nome do profissional ou "Toda a empresa".
export function linkTarget(link, professionals = []) {
  if (link.professionalId) {
    const p = professionals.find((x) => String(x.id) === String(link.professionalId));
    return p && p.name ? p.name : `Profissional #${link.professionalId}`;
  }
  return link.role === "push" ? "Todos os demais profissionais" : "Toda a empresa";
}

export function linkTitle(link) {
  return link.calendarSummary || link.calendarId || "Calendário";
}

// ---- Formulário "novo vínculo" -----------------------------------------------------------------

// form: { role, source: "app"|"existing", calendarId, professionalId, scope: "professional"|"company" }
// Retorna { ok, payload } ou { ok: false, errors }.
export function buildLinkPayload(form, { calendars = [], links = [] } = {}) {
  const f = form && typeof form === "object" ? form : {};
  const errors = {};
  const role = f.role === "busy" ? "busy" : f.role === "push" ? "push" : "";
  if (!role) return { ok: false, errors: { role: "Escolha a direção da sincronização." } };

  const professionalId = f.professionalId === null || f.professionalId === undefined || f.professionalId === "" ? null : String(f.professionalId);
  const known = (id) => calendars.some((c) => c.id === id);

  if (role === "push") {
    const payload = {};
    if (f.source === "existing") {
      if (!f.calendarId || !known(f.calendarId)) errors.calendarId = "Escolha um calendário da lista.";
      else if (!calendars.find((c) => c.id === f.calendarId).writable) errors.calendarId = "Este calendário não aceita escrita pelo AgendasPRO. Use o calendário criado pelo app.";
      else payload.calendar_id = f.calendarId;
    } else {
      payload.create_app_calendar = true;
    }
    if (professionalId) payload.professional_id = Number.isNaN(Number(professionalId)) ? professionalId : Number(professionalId);
    const dup = links.some((l) => l.role === "push" && (l.professionalId || null) === professionalId);
    if (dup) errors.professionalId = professionalId ? "Esse profissional já tem um destino de exportação." : "Já existe um destino padrão de exportação.";
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, payload: { role, ...payload } };
  }

  // busy
  if (!f.calendarId || !known(f.calendarId)) errors.calendarId = "Escolha um calendário da lista.";
  const payload = { role, calendar_id: f.calendarId };
  if (f.scope === "company") {
    payload.all_company = true;
  } else if (!professionalId) {
    errors.professionalId = "Escolha o profissional que terá a agenda bloqueada.";
  } else {
    payload.professional_id = Number.isNaN(Number(professionalId)) ? professionalId : Number(professionalId);
  }
  if (f.calendarId && links.some((l) => l.calendarId === f.calendarId)) {
    errors.calendarId = "Este calendário já está vinculado (um calendário não pode ser usado nos dois sentidos).";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, payload };
}

// ---- Status e textos -----------------------------------------------------------------------------

// Mensagens para account.last_error_code (códigos do core; desconhecido vira texto genérico sem expor o código cru).
const LAST_ERRORS = {
  google_calendar_reauth_required: "O acesso ao Google foi revogado ou expirou. Reconecte a conta.",
  google_calendar_rate_limited: "O Google limitou as chamadas. A sincronização tenta de novo sozinha.",
  google_calendar_unavailable: "O Google Agenda ficou indisponível. A sincronização tenta de novo sozinha.",
  calendar_create_failed: "Não foi possível criar o calendário do AgendasPRO. Crie-o em \"Novo vínculo\".",
  google_calendar_calendar_create_failed: "Não foi possível criar o calendário do AgendasPRO. Crie-o em \"Novo vínculo\".",
};
export function lastErrorMessage(code) {
  if (!code) return "";
  return LAST_ERRORS[code] || "A última sincronização encontrou um erro. Tente \"Sincronizar agora\".";
}

// Última atividade conhecida (envio ou leitura mais recente) em ms; 0 se nunca.
export function lastSyncTime(account, links) {
  const times = [];
  if (account && account.lastPushAt) times.push(Date.parse(account.lastPushAt));
  for (const l of links || []) if (l.lastSyncAt) times.push(Date.parse(l.lastSyncAt));
  const valid = times.filter((t) => Number.isFinite(t));
  return valid.length ? Math.max(...valid) : 0;
}

export function syncSummary(account, links, now = Date.now()) {
  const t = lastSyncTime(account, links);
  return t ? `Última sincronização ${relativeTime(t, now)}.` : "Ainda não sincronizou.";
}

export const PUSH_LATENCY_NOTE =
  "A exportação roda a cada hora e logo após conectar ou vincular. Para ver uma mudança agora, use \"Sincronizar agora\" (até 6 vezes por hora).";

// Aviso do diálogo de desconexão. Eventos exportados continuam no Google, a menos que se remova o calendário do app.
export function disconnectCopy({ removeAppCalendars = false, links = [] } = {}) {
  const hasAppCalendar = links.some((l) => l.createdByApp);
  const lines = [
    "Isto encerra a sincronização e apaga a conexão, os vínculos e os bloqueios importados do Google. Bloqueios criados manualmente continuam.",
  ];
  if (removeAppCalendars) {
    lines.push("Os calendários criados pelo AgendasPRO serão apagados no Google, junto com os eventos exportados.");
  } else {
    lines.push("Os eventos já exportados continuam na sua agenda do Google. Para apagá-los, marque a opção de remover o calendário do AgendasPRO.");
  }
  if (!hasAppCalendar && removeAppCalendars) lines.push("Nenhum calendário criado pelo app foi encontrado nos vínculos atuais.");
  return lines;
}

// Bloqueio importado do Google (somente leitura).
export const isGoogleBlock = (block) => !!block && block.source === "google";
export const GOOGLE_BLOCK_NOTE = "Importado do Google Agenda. Para remover, apague o evento no Google ou desvincule o calendário.";
export const GOOGLE_BLOCK_REASON = "Ocupado (Google Agenda)";
