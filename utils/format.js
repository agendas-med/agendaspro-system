// Formatadores puros (sem dependência do Nuxt), reutilizados pelo plugin myFunctions.
import moment from "moment";

export const formatTel = (tel) => {
  if (tel == null) return "";
  const cleaned = String(tel).replace(/\D/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})$/, "($1) $2 $3-$4");
  } else if (cleaned.length === 10) {
    return cleaned.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  return String(tel);
};

export const returnCleanNumber = (number) => {
  if (number == null) return "";
  return String(number).replace(/\D/g, "");
};

export const formatCpf = (cpf) => {
  if (cpf == null) return "";
  const cleaned = String(cpf).replace(/\D/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return String(cpf);
};

export const formatDate = (date) => {
  if (date == null || String(date).trim() === "") return "";
  const m = moment(date);
  return m.isValid() ? m.format("DD/MM/YYYY") : "";
};

export const formatHour = (date) => {
  if (date == null || String(date).trim() === "") return "";
  const m = moment(date);
  return m.isValid() ? m.format("HH:mm") : "";
};

export const formatDateFromDB = (date) => {
  if (date == null || String(date).trim() === "") return "";
  const m = moment(date);
  return m.isValid() ? m.format("YYYY-MM-DD") : "";
};

export const returnAge = (birthday) => {
  if (!birthday) return "";
  const born = moment(birthday, "YYYY-MM-DD");
  if (!born.isValid()) return "";
  const years = moment().diff(born, "years");
  return years === 1 ? `${years} Ano` : `${years} Anos`;
};

export const formatCurrency = (value) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || typeof n !== "number" || isNaN(n)) return "Valor inválido";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const returnFloatNumber = (string) => {
  let cleaned = String(string).replace(/R\$\s?/g, "").trim();
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned).toFixed(2);
};

export const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const formatMinutesToTime = (minutes) => {
  const duration = moment.duration(minutes, "minutes");
  const hours = Math.floor(duration.asHours());
  const mins = duration.minutes();
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}h`;
};

export const formatDuration = (minutes) => {
  if (!minutes || isNaN(minutes)) return "00:00";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

// Escapa texto para uso seguro como HTML (usado só onde HTML cru é inevitável).
export const escapeHtml = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Mapeia o horário de funcionamento da empresa ({ day: 1..7, hours: [{initial_date, final_date}] })
// para businessHours do FullCalendar (daysOfWeek: 0=domingo..6=sábado).
// Convenção da empresa: 1=segunda ... 7=domingo.
export const toBusinessHours = (openingHours) => {
  if (!Array.isArray(openingHours)) return [];
  const out = [];
  for (const entry of openingHours) {
    const day = Number(entry?.day);
    if (!(day >= 1 && day <= 7) || !Array.isArray(entry.hours)) continue;
    const dow = day % 7;
    for (const h of entry.hours) {
      if (h && /^\d{2}:\d{2}/.test(h.initial_date || "") && /^\d{2}:\d{2}/.test(h.final_date || "")) {
        out.push({
          daysOfWeek: [dow],
          startTime: h.initial_date.slice(0, 5),
          endTime: h.final_date.slice(0, 5),
        });
      }
    }
  }
  return out;
};
