import { describe, it, expect } from "vitest";
import { buildSeries, historyPoints, describeSeries } from "../utils/series.js";

describe("buildSeries", () => {
  it("sem valores numéricos devolve null", () => {
    expect(buildSeries([])).toBeNull();
    expect(buildSeries([{ label: "a", value: null }, { label: "b", value: "x" }])).toBeNull();
    expect(buildSeries(null)).toBeNull();
  });
  it("um ponto: sem variação e sem área", () => {
    const s = buildSeries([{ label: "05/11", value: 10 }]);
    expect(s.count).toBe(1);
    expect(s.path.startsWith("M")).toBe(true);
    expect(s.area).toBe("");
    expect(s.deltaPct).toBeNull();
  });
  it("série crescente: último ponto mais alto, delta e deltaPct", () => {
    const s = buildSeries([{ label: "a", value: 100 }, { label: "b", value: 150 }, { label: "c", value: 200 }], { width: 100, height: 50, padX: 0, padY: 0 });
    expect(s.dots.map((d) => d.x)).toEqual([0, 50, 100]);
    expect(s.dots[0].y).toBe(50);
    expect(s.dots[2].y).toBe(0);
    expect(s.delta).toBe(100);
    expect(s.deltaPct).toBe(1);
    expect(s.path).toBe("M0,50L50,25L100,0");
    expect(s.area.endsWith("Z")).toBe(true);
  });
  it("valor ausente quebra a linha em vez de virar zero", () => {
    const s = buildSeries([{ value: 1 }, { value: null }, { value: 3 }], { width: 100, height: 50, padX: 0, padY: 0 });
    expect((s.path.match(/M/g) || []).length).toBe(2);
    expect(s.count).toBe(2);
    expect(s.min).toBe(1);
  });
  it("série constante fica no meio e não divide por zero", () => {
    const s = buildSeries([{ value: 5 }, { value: 5 }], { width: 100, height: 40, padX: 0, padY: 0 });
    expect(s.dots.every((d) => d.y === 20)).toBe(true);
    expect(s.delta).toBe(0);
  });
  it("partindo de zero não calcula percentual", () => {
    expect(buildSeries([{ value: 0 }, { value: 10 }]).deltaPct).toBeNull();
  });
});

describe("historyPoints e describeSeries", () => {
  it("lê o campo do histórico e formata a data", () => {
    const pts = historyPoints([{ snapshot_date: "2026-11-05", reach: 10 }, { snapshot_date: "2026-11-06", reach: null }, null], "reach");
    expect(pts).toEqual([{ label: "05/11", value: 10 }, { label: "06/11", value: null }]);
    expect(historyPoints(undefined, "reach")).toEqual([]);
  });
  it("texto alternativo cobre vazio, um ponto, alta e queda", () => {
    expect(describeSeries("Alcance", null)).toContain("sem dados");
    expect(describeSeries("Alcance", buildSeries([{ label: "05/11", value: 3 }]))).toContain("Apenas um dia");
    expect(describeSeries("Alcance", buildSeries([{ label: "05/11", value: 3 }, { label: "06/11", value: 9 }]))).toContain("alta");
    expect(describeSeries("Alcance", buildSeries([{ label: "05/11", value: 9 }, { label: "06/11", value: 3 }]))).toContain("queda");
  });
});
