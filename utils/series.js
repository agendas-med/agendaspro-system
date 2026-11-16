// Séries históricas em SVG leve (sem biblioteca de gráficos): só números viram caminho (d="...").
// Valores ausentes (null) quebram a linha em vez de virar zero.
import { formatShortDate } from "./integrations.js";

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const r2 = (n) => Math.round(n * 100) / 100;

// points: [{ label, value }]. Retorna null se não houver nenhum valor numérico.
export function buildSeries(points, { width = 320, height = 90, padX = 6, padY = 8 } = {}) {
  const list = Array.isArray(points) ? points.map((p) => ({ label: p && p.label ? String(p.label) : "", value: num(p && p.value) })) : [];
  const values = list.map((p) => p.value).filter((v) => v !== null);
  if (!values.length) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = list.length > 1 ? innerW / (list.length - 1) : 0;
  const yOf = (v) => (span === 0 ? padY + innerH / 2 : padY + innerH - ((v - min) / span) * innerH);

  const dots = [];
  let path = "";
  let area = "";
  let segment = [];
  const flush = () => {
    if (!segment.length) return;
    path += segment.map((d, i) => `${i === 0 ? "M" : "L"}${d.x},${d.y}`).join("");
    if (segment.length > 1) {
      const last = segment[segment.length - 1];
      const firstDot = segment[0];
      const base = r2(padY + innerH);
      area += `M${firstDot.x},${base}` + segment.map((d) => `L${d.x},${d.y}`).join("") + `L${last.x},${base}Z`;
    }
    segment = [];
  };

  list.forEach((p, i) => {
    if (p.value === null) {
      flush();
      return;
    }
    const dot = { x: r2(padX + stepX * i), y: r2(yOf(p.value)), value: p.value, label: p.label };
    dots.push(dot);
    segment.push(dot);
  });
  flush();

  const first = dots[0];
  const last = dots[dots.length - 1];
  return {
    width, height, path, area, dots, min, max, count: values.length,
    first: first.value, last: last.value,
    firstLabel: first.label, lastLabel: last.label,
    delta: last.value - first.value,
    // Variação percentual (null se partir de zero ou houver um único ponto).
    deltaPct: dots.length > 1 && first.value !== 0 ? (last.value - first.value) / Math.abs(first.value) : null,
  };
}

// Uma série do histórico do core ([{ snapshot_date, reach, ... }]) para um campo.
export function historyPoints(history, field) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h === "object")
    .map((h) => ({ label: formatShortDate(h.snapshot_date), value: h[field] }));
}

// Texto alternativo do gráfico: o que um leitor de tela precisa (primeiro e último valor, variação).
export function describeSeries(name, series, format = (n) => String(n)) {
  if (!series) return `${name}: sem dados no período.`;
  if (series.count === 1) return `${name}: ${format(series.last)}${series.lastLabel ? ` em ${series.lastLabel}` : ""}. Apenas um dia registrado.`;
  const dir = series.delta > 0 ? "alta" : series.delta < 0 ? "queda" : "estável";
  const from = series.firstLabel ? ` em ${series.firstLabel}` : "";
  const to = series.lastLabel ? ` em ${series.lastLabel}` : "";
  return `${name}: de ${format(series.first)}${from} para ${format(series.last)}${to} (${dir}).`;
}
