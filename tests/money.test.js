import { describe, it, expect } from "vitest";
import { formatCents, formatBps, commissionOf } from "../utils/money.js";

// Intl usa espaço não separável entre "R$" e o valor.
const norm = (s) => s.replace(/\u00a0/g, " ");

describe("formatCents", () => {
  it("converte centavos para reais", () => {
    expect(norm(formatCents(4990))).toBe("R$ 49,90");
    expect(norm(formatCents(0))).toBe("R$ 0,00");
    expect(norm(formatCents(5))).toBe("R$ 0,05");
    expect(norm(formatCents(100000))).toBe("R$ 1.000,00");
  });
  it("aceita número em texto e negativos", () => {
    expect(norm(formatCents("4990"))).toBe("R$ 49,90");
    expect(norm(formatCents(-250))).toBe("-R$ 2,50");
  });
  it("valor inválido vira traço, nunca NaN", () => {
    for (const v of [null, undefined, "", "abc", 12.5, NaN]) expect(formatCents(v)).toBe("—");
  });
});

describe("formatBps", () => {
  it("formata taxas em bps", () => {
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(50)).toBe("0,5%");
    expect(formatBps(125)).toBe("1,25%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(null)).toBe("—");
  });
});

describe("commissionOf", () => {
  it("arredonda meio centavo para cima, como o core", () => {
    expect(commissionOf(10000, 500)).toBe(500);
    expect(commissionOf(10000, 50)).toBe(50);
    expect(commissionOf(1, 50)).toBe(0);
    expect(commissionOf(100, 50)).toBe(1); // 0,5 centavo sobe
    expect(commissionOf(null, 500)).toBe(0);
  });
});
