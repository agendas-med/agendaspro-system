import { describe, it, expect } from "vitest";
import {
  normalizeStatus, normalizeLink, normalizeCalendars, connectionState, groupLinks, linkTarget, linkTitle, buildLinkPayload,
  lastErrorMessage, lastSyncTime, syncSummary, disconnectCopy, isGoogleBlock, ROLE_LABELS,
} from "../utils/googleCalendar.js";

const cal = (over) => ({ id: "c1", summary: "AgendasPRO", primary: false, accessRole: "owner", timeZone: "America/Sao_Paulo", writable: true, ...over });

describe("normalização", () => {
  it("status com conta e vínculos; ids viram texto, professional_id null é padrão", () => {
    const s = normalizeStatus({
      configured: true, connected: true,
      account: { email: "a@b.com", status: "reauth_required", last_error_code: "google_calendar_reauth_required", refresh_token: "SEGREDO" },
      links: [{ id: 1, role: "push", professional_id: null, calendar_id: "c1", calendar_summary: "AgendasPRO", created_by_app: true, push_channel_active: false }, { role: "busy" }],
    });
    expect(s.account).toMatchObject({ email: "a@b.com", status: "reauth_required" });
    expect(JSON.stringify(s)).not.toContain("SEGREDO");
    expect(s.links).toHaveLength(1); // sem id: descartado
    expect(s.links[0]).toMatchObject({ id: "1", role: "push", professionalId: null, createdByApp: true });
    expect(normalizeStatus(null)).toMatchObject({ configured: true, connected: false, account: null, links: [] });
  });
  it("calendários: writable só owner/writer", () => {
    const list = normalizeCalendars([
      { id: "a", summary: "Principal", primary: true, access_role: "owner" },
      { id: "b", summary: "Feriados", access_role: "reader" },
      { id: "c", access_role: "writer" },
      { summary: "sem id" },
      null,
    ]);
    expect(list.map((c) => [c.id, c.writable])).toEqual([["a", true], ["b", false], ["c", true]]);
    expect(list[2].summary).toBe("c");
  });
  it("link busy com professional_id numérico", () => {
    expect(normalizeLink({ id: 9, role: "busy", professional_id: 5, calendar_id: "x" })).toMatchObject({ role: "busy", professionalId: "5" });
  });
});

describe("estado de conexão", () => {
  it("cobre desconectado, conectado, reauth e erro", () => {
    expect(connectionState({ loaded: false })).toBe("loading");
    expect(connectionState({ loaded: true, configured: false })).toBe("not_configured");
    expect(connectionState({ loaded: true, configured: true, connected: false })).toBe("disconnected");
    expect(connectionState({ loaded: true, configured: true, connected: true, account: { status: "active" } })).toBe("connected");
    expect(connectionState({ loaded: true, configured: true, connected: true, account: { status: "reauth_required" } })).toBe("reauth_required");
    expect(connectionState({ loaded: true, configured: true, connecting: true })).toBe("connecting");
    expect(connectionState({ loaded: true, configured: true, connected: false, error: true })).toBe("error");
  });
});

describe("vínculos", () => {
  const links = [
    normalizeLink({ id: 1, role: "push", professional_id: null, calendar_id: "c1", calendar_summary: "AgendasPRO", created_by_app: true }),
    normalizeLink({ id: 2, role: "busy", professional_id: 5, calendar_id: "c2", calendar_summary: "Pessoal" }),
    normalizeLink({ id: 3, role: "busy", professional_id: null, calendar_id: "c3" }),
  ];
  it("agrupa por direção e descreve o alvo", () => {
    const g = groupLinks(links);
    expect(g.push).toHaveLength(1);
    expect(g.busy).toHaveLength(2);
    const pros = [{ id: 5, name: "Ana" }];
    expect(linkTarget(links[0], pros)).toBe("Todos os demais profissionais");
    expect(linkTarget(links[1], pros)).toBe("Ana");
    expect(linkTarget(links[2], pros)).toBe("Toda a empresa");
    expect(linkTarget(links[1], [])).toBe("Profissional #5");
    expect(linkTitle(links[2])).toBe("c3");
    expect(ROLE_LABELS.busy).toContain("ocupados");
  });
});

describe("buildLinkPayload", () => {
  const calendars = [cal({ id: "c1" }), cal({ id: "c2", accessRole: "reader", writable: false }), cal({ id: "c3", summary: "Pessoal" })];
  it("push com calendário do app", () => {
    expect(buildLinkPayload({ role: "push", source: "app", professionalId: "7" }, { calendars, links: [] }))
      .toEqual({ ok: true, payload: { role: "push", create_app_calendar: true, professional_id: 7 } });
  });
  it("push em calendário existente exige escrita e existir na lista", () => {
    expect(buildLinkPayload({ role: "push", source: "existing", calendarId: "c2" }, { calendars }).errors.calendarId).toContain("escrita");
    expect(buildLinkPayload({ role: "push", source: "existing", calendarId: "zz" }, { calendars }).errors.calendarId).toBeTruthy();
    expect(buildLinkPayload({ role: "push", source: "existing", calendarId: "c1" }, { calendars }).payload).toEqual({ role: "push", calendar_id: "c1" });
  });
  it("push: um destino por profissional e um padrão", () => {
    const links = [{ role: "push", professionalId: null, calendarId: "c1" }, { role: "push", professionalId: "7", calendarId: "c1" }];
    expect(buildLinkPayload({ role: "push", source: "app" }, { calendars, links }).errors.professionalId).toContain("padrão");
    expect(buildLinkPayload({ role: "push", source: "app", professionalId: "7" }, { calendars, links }).errors.professionalId).toContain("já tem");
    expect(buildLinkPayload({ role: "push", source: "app", professionalId: "8" }, { calendars, links }).ok).toBe(true);
  });
  it("busy: profissional ou empresa inteira (opt-in), nunca nenhum dos dois", () => {
    expect(buildLinkPayload({ role: "busy", calendarId: "c3", scope: "professional", professionalId: "5" }, { calendars }).payload)
      .toEqual({ role: "busy", calendar_id: "c3", professional_id: 5 });
    expect(buildLinkPayload({ role: "busy", calendarId: "c3", scope: "company" }, { calendars }).payload)
      .toEqual({ role: "busy", calendar_id: "c3", all_company: true });
    expect(buildLinkPayload({ role: "busy", calendarId: "c3", scope: "professional" }, { calendars }).errors.professionalId).toBeTruthy();
  });
  it("busy: calendário já vinculado (evita eco entre os dois sentidos)", () => {
    const links = [{ role: "push", professionalId: null, calendarId: "c1" }];
    expect(buildLinkPayload({ role: "busy", calendarId: "c1", scope: "company" }, { calendars, links }).errors.calendarId).toContain("já está vinculado");
  });
  it("sem direção", () => {
    expect(buildLinkPayload({}, { calendars }).errors.role).toBeTruthy();
    expect(buildLinkPayload(null).ok).toBe(false);
  });
});

describe("textos de status", () => {
  it("lastErrorMessage nunca devolve o código cru", () => {
    expect(lastErrorMessage("")).toBe("");
    expect(lastErrorMessage("google_calendar_reauth_required")).toContain("Reconecte");
    const unknown = lastErrorMessage("boom_x");
    expect(unknown).not.toContain("boom_x");
  });
  it("última sincronização: maior entre envio e leitura", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    const account = { lastPushAt: "2026-11-16T10:00:00Z" };
    const links = [{ lastSyncAt: "2026-11-16T11:30:00Z" }, { lastSyncAt: "" }];
    expect(lastSyncTime(account, links)).toBe(Date.parse("2026-11-16T11:30:00Z"));
    expect(syncSummary(account, links, now)).toBe("Última sincronização há 30 min.");
    expect(syncSummary({}, [], now)).toBe("Ainda não sincronizou.");
    expect(syncSummary(null, null, now)).toBe("Ainda não sincronizou.");
  });
  it("aviso de desconexão muda com a opção de apagar o calendário do app", () => {
    const keep = disconnectCopy({ removeAppCalendars: false, links: [{ createdByApp: true }] }).join(" ");
    expect(keep).toContain("continuam na sua agenda do Google");
    const remove = disconnectCopy({ removeAppCalendars: true, links: [{ createdByApp: true }] }).join(" ");
    expect(remove).toContain("serão apagados no Google");
  });
  it("bloqueio importado é somente leitura", () => {
    expect(isGoogleBlock({ source: "google" })).toBe(true);
    expect(isGoogleBlock({ source: "manual" })).toBe(false);
    expect(isGoogleBlock(null)).toBe(false);
  });
});
