import { describe, it, expect } from "vitest";
import { apiErrorMessage, toDisplayText, messageFromBody, errorCode } from "../utils/errors.js";
import {
  formatTel, formatCpf, formatDateFromDB, formatCurrency, returnFloatNumber,
  escapeHtml, toBusinessHours, formatDuration,
} from "../utils/format.js";
import { passwordStrength } from "../utils/password.js";

describe("errors", () => {
  it("extrai mensagem do formato antigo e do novo", () => {
    expect(messageFromBody({ message: "Falhou" })).toBe("Falhou");
    expect(messageFromBody({ error: { code: "X", message: "Padronizado" } })).toBe("Padronizado");
    expect(messageFromBody({ errors: [{ message: "a" }, { message: "b" }] })).toBe("a\nb");
  });

  it("nunca devolve objeto cru nem HTML de proxy", () => {
    expect(apiErrorMessage({ response: { status: 502, data: "<html>bad gateway</html>" } }))
      .toBe("Serviço temporariamente indisponível. Tente novamente em instantes.");
    expect(toDisplayText({ foo: "bar" })).not.toContain("[object Object]");
  });

  it("trata rede e timeout", () => {
    expect(apiErrorMessage({ code: "ECONNABORTED", message: "timeout of 15000ms" })).toMatch(/demorou/);
    expect(apiErrorMessage({ message: "Network Error", request: {} })).toMatch(/conectar/);
  });

  it("usa fallback e lê o code padronizado", () => {
    expect(apiErrorMessage(null, "fb")).toBe("fb");
    expect(errorCode({ response: { data: { error: { code: "VALIDATION" } } } })).toBe("VALIDATION");
    expect(errorCode({})).toBe("");
  });
});

describe("format", () => {
  it("formata telefone e CPF e tolera nulo", () => {
    expect(formatTel("11987654321")).toBe("(11) 9 8765-4321");
    expect(formatTel("1133334444")).toBe("(11) 3333-4444");
    expect(formatTel(null)).toBe("");
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
    expect(formatCpf(undefined)).toBe("");
  });

  it("datas vazias viram string vazia", () => {
    expect(formatDateFromDB("")).toBe("");
    expect(formatDateFromDB(null)).toBe("");
    expect(formatDateFromDB("2000-05-17")).toBe("2000-05-17");
  });

  it("moeda e números", () => {
    expect(formatCurrency("abc")).toBe("Valor inválido");
    expect(returnFloatNumber("R$ 1.234,50")).toBe("1234.50");
    expect(formatDuration(90)).toBe("01:30");
  });

  it("escapeHtml neutraliza marcação", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml(null)).toBe("");
  });

  it("toBusinessHours converte 1..7 (seg..dom) para 0..6 do FullCalendar", () => {
    const out = toBusinessHours([
      { day: 1, hours: [{ initial_date: "08:00:00", final_date: "12:00:00" }] },
      { day: 7, hours: [{ initial_date: "09:00", final_date: "13:00" }] },
      { day: 9, hours: [{ initial_date: "09:00", final_date: "13:00" }] },
      { day: 2, hours: [{ initial_date: "", final_date: "13:00" }] },
    ]);
    expect(out).toEqual([
      { daysOfWeek: [1], startTime: "08:00", endTime: "12:00" },
      { daysOfWeek: [0], startTime: "09:00", endTime: "13:00" },
    ]);
    expect(toBusinessHours(undefined)).toEqual([]);
  });
});

describe("password", () => {
  it("rejeita senhas curtas e aceita senhas variadas", () => {
    expect(passwordStrength("abc").acceptable).toBe(false);
    expect(passwordStrength("12345678").acceptable).toBe(false);
    expect(passwordStrength("abcd1234").acceptable).toBe(true);
    expect(passwordStrength("Abcd1234!x").score).toBe(4);
    expect(passwordStrength(undefined).score).toBe(0);
  });
});
