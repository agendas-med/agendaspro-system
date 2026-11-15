// Montagem de payloads para o core: só campos conhecidos (o core rejeita campos desconhecidos),
// sem strings vazias onde o contrato quer ausência. Puro: sem Nuxt nem axios.

import { BILLING_TYPES, DEFAULT_BILLING_TYPE } from "./billing.js";

// Rotas F2 devolvem { data }; rotas legadas, { returnObj }. Aceita os dois.
export function unwrap(response) {
  const body = response && response.data !== undefined && response.status !== undefined ? response.data : response;
  if (body && typeof body === "object") {
    if (body.data !== undefined) return body.data;
    if (body.returnObj !== undefined) return body.returnObj;
  }
  return body;
}

const trimmed = (value) => (typeof value === "string" ? value.trim() : value);

// ---- Profissionais ----
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_PROFESSIONAL_COLOR = "#4a90e2";

export function buildProfessionalPayload(form, { isEdit = false } = {}) {
  const payload = { name: trimmed(form.name) || "" };
  // E-mail/telefone: vazio vira null (limpa o campo na edição; ausente na criação).
  for (const key of ["email", "phone"]) {
    const value = trimmed(form[key]);
    if (value) payload[key] = value;
    else if (isEdit) payload[key] = null;
  }
  if (form.color && COLOR_PATTERN.test(form.color)) payload.color = form.color.toLowerCase();
  if (Array.isArray(form.service_ids)) {
    payload.service_ids = [...new Set(form.service_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  }
  if (isEdit && typeof form.active === "boolean") payload.active = form.active;
  return payload;
}

// ---- Expediente (0 = domingo ... 6 = sábado) ----
export const WEEKDAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(time) {
  if (time === "24:00") return 24 * 60;
  if (!TIME_PATTERN.test(String(time || ""))) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// <input type="time"> não representa "24:00": o fim "00:00" significa meia-noite do mesmo dia
// ("24:00" para o core). Início 00:00 + fim 00:00 = dia inteiro.
export function normalizeEndTime(start, end) {
  return end === "00:00" && start ? "24:00" : end;
}

// Inverso, para exibir no <input type="time">.
export function displayEndTime(end) {
  return end === "24:00" ? "00:00" : end;
}

// { weekday: [{start_time, end_time}] } a partir da lista da API.
export function rulesToWeek(rules) {
  const week = {};
  for (const day of WEEKDAYS) week[day.value] = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const weekday = Number(rule.weekday);
    if (!week[weekday]) continue;
    week[weekday].push({
      start_time: String(rule.start_time).slice(0, 5),
      end_time: displayEndTime(String(rule.end_time).slice(0, 5)),
    });
  }
  for (const day of Object.keys(week)) week[day].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  return week;
}

// Valida a semana; devolve lista de mensagens (vazia = ok).
export function validateWeek(week) {
  const errors = [];
  for (const day of WEEKDAYS) {
    const label = day.label;
    const entries = (week[day.value] || []).map((e) => ({
      start: timeToMinutes(e.start_time),
      end: timeToMinutes(normalizeEndTime(e.start_time, e.end_time)),
    }));
    for (const e of entries) {
      if (Number.isNaN(e.start) || Number.isNaN(e.end)) {
        errors.push(`${label}: informe início e fim.`);
        break;
      }
      if (e.end <= e.start) {
        errors.push(`${label}: o fim deve ser depois do início.`);
        break;
      }
    }
    const sorted = entries.filter((e) => !Number.isNaN(e.start) && !Number.isNaN(e.end) && e.end > e.start)
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        errors.push(`${label}: há horários sobrepostos.`);
        break;
      }
    }
  }
  return errors;
}

// Corpo do PUT /availability-rules/professional/:id
export function buildRulesPayload(week) {
  const rules = [];
  for (const day of WEEKDAYS) {
    for (const entry of week[day.value] || []) {
      rules.push({
        weekday: day.value,
        start_time: entry.start_time,
        end_time: normalizeEndTime(entry.start_time, entry.end_time),
      });
    }
  }
  return { rules };
}

// ---- Bloqueios / feriados ----
const pad = (n) => String(n).padStart(2, "0");

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// "2027-03-07T09:00" (datetime-local) -> "2027-03-07 09:00"
export function toWallTime(value) {
  if (typeof value !== "string") return "";
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : "";
}

// scope: "company" | id do profissional. Dia inteiro: [dia 00:00, dia seguinte 00:00).
export function buildTimeBlockPayload({ scope, allDay, date, startsAt, endsAt, reason }) {
  let starts;
  let ends;
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return { error: "Informe a data." };
    starts = `${date} 00:00`;
    ends = `${nextDay(date)} 00:00`;
  } else {
    starts = toWallTime(startsAt);
    ends = toWallTime(endsAt);
    if (!starts || !ends) return { error: "Informe início e fim." };
    if (ends <= starts) return { error: "O fim do bloqueio deve ser depois do início." };
  }
  const payload = {
    professional_id: scope === "company" || scope == null || scope === "" ? null : Number(scope),
    starts_at: starts,
    ends_at: ends,
  };
  const text = trimmed(reason);
  if (text) payload.reason = text;
  return { payload };
}

// "2027-03-07 09:00" -> "07/03/2027 09:00". O core devolve hora de parede da empresa:
// não converte fuso (nem para o do navegador).
export function formatWall(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(value || "");
}

// Intervalo de consulta de bloqueios (precisa de hora: YYYY-MM-DD HH:mm).
export function timeBlocksParams({ from, to } = {}) {
  const params = {};
  if (from) params.from = `${from} 00:00`;
  if (to) params.to = `${to} 23:59`;
  return params;
}

// ---- Assinatura ----
export function buildSubscriptionPayload(planCode, billingType) {
  const payload = { plan_code: planCode };
  if (planCode === "premium") {
    payload.billing_type = BILLING_TYPES.some((t) => t.value === billingType) ? billingType : DEFAULT_BILLING_TYPE;
  }
  return payload;
}

// ---- Agendamentos ----
const SERVICE_KEYS = [
  "id", "company_id", "name", "value", "cost", "observations", "duration",
  "requires_location", "accepts_quantity", "measurement_unit", "quantity",
];
const APPOINTMENT_KEYS = [
  "customer_id", "customer_name", "date", "duration", "observations", "status",
  "zip_code", "address", "number", "complement", "city", "state",
];

function pickService(service) {
  const out = {};
  for (const key of SERVICE_KEYS) if (service && service[key] !== undefined) out[key] = service[key];
  return out;
}

// professionalId: undefined = não envia (mantém o atual no PATCH); null = sem profissional; número = profissional.
export function buildAppointmentPayload(source, { professionalId } = {}) {
  const payload = {};
  for (const key of APPOINTMENT_KEYS) {
    if (source[key] !== undefined) payload[key] = source[key];
  }
  if (payload.duration != null) payload.duration = String(payload.duration);
  payload.services = (source.services || []).map(pickService);
  if (professionalId !== undefined) {
    payload.professional_id = professionalId === null || professionalId === "" ? null : Number(professionalId);
  }
  return payload;
}

// Hora de parede de uma string ISO ("2027-03-07T09:00:00-03:00", "2027-03-07 09:00") como
// "YYYY-MM-DD HH:mm:ss", sem converter para o fuso do navegador. Vazio se não reconhecer.
export function wallClock(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]} ${m[2]}:${m[3] || "00"}` : "";
}

// Minutos entre duas horas de parede (calculado em UTC: sem efeito de DST/fuso do navegador).
export function wallMinutesBetween(start, end) {
  const toMs = (value) => {
    const m = wallClock(value).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
  };
  return Math.round((toMs(end) - toMs(start)) / 60000);
}

// Decide o professional_id do payload de agendamento.
// undefined = não envia (criação sem escolha; edição sem mudança: omitir mantém o atual no core).
// null = remover o profissional (só edição); número = profissional.
export function professionalIdForPayload({ isEdit, selected, original }) {
  const norm = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
  const current = norm(selected);
  if (isEdit) return current === norm(original) ? undefined : current;
  return current === null ? undefined : current;
}

// Novo agendamento nasce para o profissional filtrado, se ele existir e estiver ativo.
export function presetProfessionalId(filter, professionals) {
  if (typeof filter !== "number") return null;
  const found = (Array.isArray(professionals) ? professionals : []).find((p) => p.id === filter);
  return found && found.active ? found.id : null;
}

// ---- Empresa ----
const COMPANY_KEYS = [
  "id", "products", "services", "configurations", "name", "address", "zip_code", "city", "state",
  "business_type", "roles", "asaas_status",
];

// PATCH /companies/:id: o core rejeita campos desconhecidos e o objeto global da empresa tem outros.
export function buildCompanyPayload(company) {
  const payload = {};
  for (const key of COMPANY_KEYS) if (company && company[key] !== undefined) payload[key] = company[key];
  return payload;
}

// Mapa id -> profissional e cor/nome do evento na agenda.
export function professionalsById(list) {
  const map = {};
  for (const p of Array.isArray(list) ? list : []) map[p.id] = p;
  return map;
}

export function filterEventsByProfessional(events, professionalId) {
  if (professionalId === "" || professionalId == null || professionalId === "all") return events;
  if (professionalId === "none") return events.filter((e) => e.professional_id == null);
  return events.filter((e) => Number(e.professional_id) === Number(professionalId));
}

// Fuso padrão do calendário quando a empresa não definiu um.
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export const BRAZIL_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Maceio",
  "America/Araguaina",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Manaus",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
];
