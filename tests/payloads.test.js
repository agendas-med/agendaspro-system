import { describe, it, expect } from "vitest";
import {
  unwrap, buildProfessionalPayload, rulesToWeek, validateWeek, buildRulesPayload, timeToMinutes,
  normalizeEndTime, buildTimeBlockPayload, timeBlocksParams, buildSubscriptionPayload,
  buildAppointmentPayload, filterEventsByProfessional, toWallTime,
  formatWall, wallClock, wallMinutesBetween, professionalIdForPayload, presetProfessionalId, buildCompanyPayload,
  coreWall, normalizeAppointmentEvent, eventOverlapsRange,
} from "../utils/payloads.js";

describe("agendamentos vindos do core (ISO com Z = parede + 3h)", () => {
  it("coreWall devolve a parede da empresa a partir do Z do driver e aceita parede pura", () => {
    expect(coreWall("2027-03-07T12:00:00.000Z")).toBe("2027-03-07 09:00:00");
    expect(coreWall("2027-03-08T02:30:00.000Z")).toBe("2027-03-07 23:30:00");
    expect(coreWall("2027-03-07T09:00:00-03:00")).toBe("2027-03-07 09:00:00");
    expect(coreWall("2027-03-07 09:00:00")).toBe("2027-03-07 09:00:00");
    expect(coreWall("2027-03-07T09:00:00")).toBe("2027-03-07 09:00:00");
    expect(coreWall("")).toBe("");
  });
  it("normalizeAppointmentEvent grava start/end/date em parede e mantém os demais campos", () => {
    const e = normalizeAppointmentEvent({ id: 1, professional_id: 3, date: "2027-03-07T12:00:00.000Z", start: "2027-03-07T12:00:00.000Z", end: "2027-03-07T13:30:00.000Z" });
    expect(e).toMatchObject({ id: 1, professional_id: 3, date: "2027-03-07 09:00:00", start: "2027-03-07T09:00:00", end: "2027-03-07T10:30:00" });
  });
  it("normalizeAppointmentEvent sem data válida não quebra", () => {
    expect(normalizeAppointmentEvent({ id: 2, start: "x" })).toEqual({ id: 2, start: "x" });
  });
  it("eventOverlapsRange compara em parede, com início inclusivo e fim exclusivo", () => {
    const range = { start: "2027-03-07T00:00:00-03:00", end: "2027-03-08T00:00:00-03:00" };
    expect(eventOverlapsRange({ start: "2027-03-07T09:00:00", end: "2027-03-07T10:00:00" }, range)).toBe(true);
    expect(eventOverlapsRange({ start: "2027-03-08T00:00:00", end: "2027-03-08T01:00:00" }, range)).toBe(false);
    expect(eventOverlapsRange({ start: "2027-03-06T22:00:00", end: "2027-03-07T00:30:00" }, range)).toBe(true);
    expect(eventOverlapsRange({ start: "2027-03-05T10:00:00", end: "2027-03-05T11:00:00" }, { start: "2027-03-07", end: "2027-03-14" })).toBe(false);
  });
});

describe("hora de parede (fuso da empresa)", () => {
  it("wallClock ignora o offset e não converte para o fuso do navegador", () => {
    expect(wallClock("2027-03-07T09:00:00-03:00")).toBe("2027-03-07 09:00:00");
    expect(wallClock("2027-03-07 09:30")).toBe("2027-03-07 09:30:00");
    expect(wallClock("2027-03-07T09:00:00Z")).toBe("2027-03-07 09:00:00");
    expect(wallClock("lixo")).toBe("");
  });
  it("wallMinutesBetween usa só a hora de parede", () => {
    expect(wallMinutesBetween("2027-03-07T09:00:00-03:00", "2027-03-07T10:30:00-03:00")).toBe(90);
    expect(wallMinutesBetween("2027-03-07T23:30:00", "2027-03-08T00:15:00")).toBe(45);
    expect(wallMinutesBetween("x", "2027-03-08T00:15:00")).toBeNaN();
  });
  it("formatWall mostra a data como veio do core", () => {
    expect(formatWall("2027-03-07 09:00")).toBe("07/03/2027 09:00");
    expect(formatWall("2027-03-07T09:00:00")).toBe("07/03/2027 09:00");
    expect(formatWall(null)).toBe("");
  });
});

describe("professional_id do agendamento", () => {
  it("criação: só envia se escolhido", () => {
    expect(professionalIdForPayload({ isEdit: false, selected: "", original: "" })).toBeUndefined();
    expect(professionalIdForPayload({ isEdit: false, selected: 4, original: "" })).toBe(4);
  });
  it("edição: omite se não mudou, envia número se mudou e null se removeu", () => {
    expect(professionalIdForPayload({ isEdit: true, selected: 4, original: 4 })).toBeUndefined();
    expect(professionalIdForPayload({ isEdit: true, selected: "", original: null })).toBeUndefined();
    expect(professionalIdForPayload({ isEdit: true, selected: 5, original: 4 })).toBe(5);
    expect(professionalIdForPayload({ isEdit: true, selected: "", original: 4 })).toBeNull();
  });
  it("pré-seleciona o filtro só se for profissional ativo", () => {
    const list = [{ id: 1, active: true }, { id: 2, active: false }];
    expect(presetProfessionalId(1, list)).toBe(1);
    expect(presetProfessionalId(2, list)).toBeNull();
    expect(presetProfessionalId(9, list)).toBeNull();
    expect(presetProfessionalId("all", list)).toBeNull();
    expect(presetProfessionalId("none", list)).toBeNull();
  });
});

describe("buildCompanyPayload", () => {
  it("envia só os campos que o core aceita no PATCH /companies/:id", () => {
    const payload = buildCompanyPayload({
      id: 1, name: "Studio", address: "Rua A, 10", zip_code: "01000-000", city: "SP", state: "SP", business_type: 2,
      configurations: { notifications: [], opening_hours: [] }, roles: [], services: [], products: [],
      asaas_status: null, email: "x@example.com", document: "00", plan_code: "free", timezone: "America/Sao_Paulo",
    });
    expect(Object.keys(payload).sort()).toEqual([
      "address", "asaas_status", "business_type", "city", "configurations", "id", "name", "products", "roles",
      "services", "state", "zip_code",
    ]);
  });
  it("poda também os níveis aninhados de configurations", () => {
    const payload = buildCompanyPayload({
      name: "Studio",
      configurations: {
        extra: 1,
        notifications: [{ id: 1, code: "a", name: "A", active: true, description: "x" }],
        opening_hours: [{ day: 1, label: "seg", hours: [{ initial_date: "09:00", final_date: "18:00", id: 3 }] }],
      },
    });
    expect(payload.configurations).toEqual({
      notifications: [{ id: 1, code: "a", name: "A", active: true }],
      opening_hours: [{ day: 1, hours: [{ initial_date: "09:00", final_date: "18:00" }] }],
    });
  });
});

describe("unwrap", () => {
  it("aceita {data} (F2), {returnObj} (legado) e resposta do axios", () => {
    expect(unwrap({ data: { data: [1] }, status: 200 })).toEqual([1]);
    expect(unwrap({ data: { returnObj: { a: 1 } }, status: 200 })).toEqual({ a: 1 });
    expect(unwrap({ data: [1] })).toEqual([1]);
    expect(unwrap(null)).toBeNull();
  });
});

describe("buildProfessionalPayload", () => {
  it("criação omite e-mail/telefone vazios e campos desconhecidos", () => {
    const p = buildProfessionalPayload({ name: " Ana ", email: "", phone: " ", color: "#AABBCC", service_ids: ["2", 2, 3, "x"], user_id: 9, photo_url: "" });
    expect(p).toEqual({ name: "Ana", color: "#aabbcc", service_ids: [2, 3] });
  });
  it("edição limpa e-mail/telefone com null e envia active", () => {
    const p = buildProfessionalPayload({ name: "Ana", email: "", phone: "11999990000", active: false }, { isEdit: true });
    expect(p).toEqual({ name: "Ana", email: null, phone: "11999990000", active: false });
  });
  it("ignora cor inválida", () => {
    expect(buildProfessionalPayload({ name: "A", color: "red" })).toEqual({ name: "A" });
  });
});

describe("expediente semanal", () => {
  it("converte regras da API em semana e de volta", () => {
    const week = rulesToWeek([
      { weekday: 1, start_time: "13:00:00", end_time: "18:00:00" },
      { weekday: 1, start_time: "09:00", end_time: "12:00" },
      { weekday: 0, start_time: "08:00", end_time: "12:00" },
    ]);
    expect(week[1]).toEqual([{ start_time: "09:00", end_time: "12:00" }, { start_time: "13:00", end_time: "18:00" }]);
    expect(buildRulesPayload(week).rules).toEqual([
      { weekday: 1, start_time: "09:00", end_time: "12:00" },
      { weekday: 1, start_time: "13:00", end_time: "18:00" },
      { weekday: 0, start_time: "08:00", end_time: "12:00" },
    ]);
  });
  it("fim 00:00 vira 24:00 (meia-noite do mesmo dia)", () => {
    expect(normalizeEndTime("18:00", "00:00")).toBe("24:00");
    expect(normalizeEndTime("00:00", "00:00")).toBe("24:00");
    expect(normalizeEndTime("", "")).toBe("");
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(buildRulesPayload({ 5: [{ start_time: "18:00", end_time: "00:00" }] }).rules)
      .toEqual([{ weekday: 5, start_time: "18:00", end_time: "24:00" }]);
  });
  it("24:00 vindo do core aparece como 00:00 no input de hora e volta como 24:00 ao salvar", () => {
    const week = rulesToWeek([
      { weekday: 5, start_time: "18:00", end_time: "24:00" },
      { weekday: 6, start_time: "00:00", end_time: "24:00" },
    ]);
    expect(week[5]).toEqual([{ start_time: "18:00", end_time: "00:00" }]);
    expect(validateWeek(week)).toEqual([]);
    expect(buildRulesPayload(week).rules).toEqual([
      { weekday: 5, start_time: "18:00", end_time: "24:00" },
      { weekday: 6, start_time: "00:00", end_time: "24:00" },
    ]);
  });
  it("valida fim depois do início, sobreposição e campos vazios", () => {
    expect(validateWeek({ 1: [{ start_time: "09:00", end_time: "12:00" }, { start_time: "13:00", end_time: "18:00" }] })).toEqual([]);
    expect(validateWeek({ 1: [{ start_time: "12:00", end_time: "09:00" }] })[0]).toMatch(/depois do início/);
    expect(validateWeek({ 2: [{ start_time: "09:00", end_time: "12:00" }, { start_time: "11:00", end_time: "14:00" }] })[0]).toMatch(/sobrepostos/);
    expect(validateWeek({ 3: [{ start_time: "", end_time: "12:00" }] })[0]).toMatch(/informe/i);
  });
});

describe("bloqueios", () => {
  it("dia inteiro cobre [dia 00:00, dia seguinte 00:00) e vale para a empresa", () => {
    const { payload } = buildTimeBlockPayload({ scope: "company", allDay: true, date: "2027-12-31", reason: " Feriado " });
    expect(payload).toEqual({ professional_id: null, starts_at: "2027-12-31 00:00", ends_at: "2028-01-01 00:00", reason: "Feriado" });
  });
  it("intervalo por profissional usa YYYY-MM-DD HH:mm e omite motivo vazio", () => {
    const { payload } = buildTimeBlockPayload({ scope: "7", startsAt: "2027-03-07T09:00", endsAt: "2027-03-07T12:30", reason: "" });
    expect(payload).toEqual({ professional_id: 7, starts_at: "2027-03-07 09:00", ends_at: "2027-03-07 12:30" });
  });
  it("rejeita datas inválidas ou fim antes do início", () => {
    expect(buildTimeBlockPayload({ scope: "company", allDay: true, date: "" }).error).toBeTruthy();
    expect(buildTimeBlockPayload({ scope: "company", startsAt: "2027-03-07T12:00", endsAt: "2027-03-07T09:00" }).error).toMatch(/depois do início/);
    expect(buildTimeBlockPayload({ scope: "company", startsAt: "", endsAt: "" }).error).toBeTruthy();
  });
  it("converte datetime-local e filtros de período", () => {
    expect(toWallTime("2027-03-07T09:00")).toBe("2027-03-07 09:00");
    expect(toWallTime("lixo")).toBe("");
    expect(timeBlocksParams({ from: "2027-03-01", to: "2027-03-31" })).toEqual({ from: "2027-03-01 00:00", to: "2027-03-31 23:59" });
    expect(timeBlocksParams({ from: "", to: "" })).toEqual({});
  });
});

describe("assinatura", () => {
  it("premium envia billing_type válido; free não envia", () => {
    expect(buildSubscriptionPayload("premium", "PIX")).toEqual({ plan_code: "premium", billing_type: "PIX" });
    expect(buildSubscriptionPayload("premium", "XYZ")).toEqual({ plan_code: "premium", billing_type: "UNDEFINED" });
    expect(buildSubscriptionPayload("free", "PIX")).toEqual({ plan_code: "free" });
  });
});

describe("agendamento", () => {
  const source = {
    id: 5, company_id: 1, customer_id: 3, customer_name: "Bia", date: "2027-03-07 09:00", duration: 60,
    observations: "x", status: "scheduled", color: "#fff", professional_id: 4, extra: true,
    services: [{ id: 1, name: "Corte", value: 50, cost: 5, duration: 30, junk: 1, requires_location: 0 }],
  };
  it("só envia campos conhecidos e serviços sem lixo", () => {
    const p = buildAppointmentPayload(source);
    expect(p).not.toHaveProperty("extra");
    expect(p).not.toHaveProperty("id");
    expect(p).not.toHaveProperty("color");
    expect(p).not.toHaveProperty("professional_id"); // omitido mantém o atual no PATCH
    expect(p.duration).toBe("60");
    expect(p.services).toEqual([{ id: 1, name: "Corte", value: 50, cost: 5, duration: 30, requires_location: 0 }]);
  });
  it("professional_id: número, null (sem profissional) ou omitido", () => {
    expect(buildAppointmentPayload(source, { professionalId: "4" }).professional_id).toBe(4);
    expect(buildAppointmentPayload(source, { professionalId: "" }).professional_id).toBeNull();
    expect(buildAppointmentPayload(source, { professionalId: null }).professional_id).toBeNull();
  });
  it("filtra eventos por profissional", () => {
    const events = [{ id: 1, professional_id: 4 }, { id: 2, professional_id: null }, { id: 3, professional_id: 5 }];
    expect(filterEventsByProfessional(events, "")).toHaveLength(3);
    expect(filterEventsByProfessional(events, "4").map((e) => e.id)).toEqual([1]);
    expect(filterEventsByProfessional(events, "none").map((e) => e.id)).toEqual([2]);
  });
});
