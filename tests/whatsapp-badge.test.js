import { describe, it, expect } from "vitest";
import { fakeApi, ok, err } from "./helpers/fakeApi.js";
import {
  BADGE_POLL_MS, badgeLabel, badgeText, createBadgeController, initialBadgeState, normalizeSummary, waitingCount,
} from "../utils/whatsappBadge.js";

const STATUS = "GET /whatsapp/status";
const SUMMARY = "GET /whatsapp/conversations/summary";
const summaryBody = (waiting = 3, extra = {}) => ({
  total: 9, bot: 4, human: 5, waiting, assumed: 2, mine: 1, opted_out: 1, unread_conversations: 2, unread_messages: 6, ...extra,
});

describe("normalizeSummary", () => {
  it("lê o contrato do core", () => {
    expect(normalizeSummary(summaryBody(3))).toEqual({
      total: 9, bot: 4, human: 5, waiting: 3, assumed: 2, mine: 1, optedOut: 1, unreadConversations: 2, unreadMessages: 6,
    });
  });
  it("tolera lixo: tudo vira zero", () => {
    for (const raw of [null, undefined, "x", 42, [], { waiting: "abc", total: -5, bot: NaN, human: Infinity }]) {
      expect(Object.values(normalizeSummary(raw)).every((v) => v === 0)).toBe(true);
    }
  });
  it("aceita números em texto e descarta fração", () => {
    expect(normalizeSummary({ waiting: "7", total: 2.9 })).toMatchObject({ waiting: 7, total: 2 });
  });
});

describe("badgeText / badgeLabel / waitingCount", () => {
  it("zero e inválidos não mostram nada", () => {
    for (const v of [0, -1, null, undefined, "abc", NaN]) {
      expect(badgeText(v)).toBe("");
      expect(badgeLabel(v)).toBe("");
    }
  });
  it("limite visual 99+", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
    expect(badgeText(5000)).toBe("99+");
  });
  it("texto de leitor de tela com singular e plural", () => {
    expect(badgeLabel(1)).toBe("1 conversa aguardando atendimento");
    expect(badgeLabel(2)).toBe("2 conversas aguardando atendimento");
    expect(badgeLabel(99)).toBe("99 conversas aguardando atendimento");
    expect(badgeLabel(100)).toBe("mais de 99 conversas aguardando atendimento");
  });
  it("waitingCount lê só o aguardando", () => {
    expect(waitingCount(normalizeSummary(summaryBody(4)))).toBe(4);
    expect(waitingCount(null)).toBe(0);
  });
});

function harness({ handlers, visible = true } = {}) {
  const fake = fakeApi(handlers);
  const timers = new Map();
  let next = 1;
  const env = { visible };
  const state = initialBadgeState();
  const controller = createBadgeController({
    api: fake.api,
    state,
    isVisible: () => env.visible,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const fire = async () => {
    const entry = [...timers.entries()][0];
    if (!entry) return false;
    timers.delete(entry[0]);
    await entry[1].fn();
    return true;
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { ...fake, controller, state, timers, env, fire, settle };
}

const on = (waiting = 3) => ({ [STATUS]: ok({ enabled: true }), [SUMMARY]: ok(summaryBody(waiting)) });

describe("createBadgeController", () => {
  it("start: confere o status uma vez, lê o resumo na hora e agenda a próxima rodada longa", async () => {
    const h = harness({ handlers: on(3) });
    h.controller.start();
    await h.settle();
    expect(h.state.status).toBe("on");
    expect(waitingCount(h.state.summary)).toBe(3);
    expect(h.count(STATUS)).toBe(1);
    expect(h.count(SUMMARY)).toBe(1);
    expect([...h.timers.values()].map((t) => t.ms)).toEqual([BADGE_POLL_MS]);
    expect(BADGE_POLL_MS).toBeGreaterThanOrEqual(60000);
  });

  it("as chamadas são passivas (não abrem o modal de upgrade)", async () => {
    const h = harness({ handlers: on() });
    h.controller.start();
    await h.settle();
    expect(h.calls.every((c) => c.suppress)).toBe(true);
  });

  it("cada rodada só consulta o resumo (o status não é repetido) e atualiza o número", async () => {
    let waiting = 3;
    const h = harness({ handlers: { [STATUS]: ok({ enabled: true }), [SUMMARY]: async () => ok(summaryBody(waiting)) } });
    h.controller.start();
    await h.settle();
    waiting = 120;
    await h.fire();
    expect(h.count(STATUS)).toBe(1);
    expect(h.count(SUMMARY)).toBe(2);
    expect(badgeText(waitingCount(h.state.summary))).toBe("99+");
    expect(h.timers.size).toBe(1);
  });

  it("WhatsApp desligado: sem resumo, sem polling e sem número", async () => {
    const h = harness({ handlers: { [STATUS]: ok({ enabled: false }), [SUMMARY]: ok(summaryBody(5)) } });
    h.controller.start();
    await h.settle();
    expect(h.state.status).toBe("off");
    expect(h.state.summary).toBeNull();
    expect(h.count(SUMMARY)).toBe(0);
    expect(h.timers.size).toBe(0);
    h.controller.start(); // mesmo remontando o menu, não consulta de novo
    await h.settle();
    expect(h.calls.length).toBe(1);
  });

  it("core sem o recurso (404) ou sem permissão (403) para de vez", async () => {
    for (const status of [404, 403, 402]) {
      const h = harness({ handlers: { [STATUS]: err(status, "x"), [SUMMARY]: ok(summaryBody()) } });
      h.controller.start();
      await h.settle();
      expect(h.state.status).toBe("off");
      expect(h.count(SUMMARY)).toBe(0);
      expect(h.timers.size).toBe(0);
    }
    const h = harness({ handlers: { [STATUS]: ok({ enabled: true }), [SUMMARY]: err(403, "forbidden") } });
    h.controller.start();
    await h.settle();
    expect(h.state.status).toBe("off");
    expect(h.timers.size).toBe(0);
  });

  it("erro de rede ou 5xx é silencioso: mantém o último número e tenta de novo", async () => {
    let mode = "ok";
    const h = harness({
      handlers: {
        [STATUS]: ok({ enabled: true }),
        [SUMMARY]: async () => (mode === "ok" ? ok(summaryBody(2)) : mode === "net" ? { network: true } : err(500, "boom")),
      },
    });
    h.controller.start();
    await h.settle();
    mode = "net";
    await h.fire();
    mode = "500";
    await h.fire();
    expect(h.state.status).toBe("on");
    expect(waitingCount(h.state.summary)).toBe(2);
    expect(h.timers.size).toBe(1);
  });

  it("falha transitória no status (5xx) repete o status na próxima rodada", async () => {
    let attempt = 0;
    const h = harness({ handlers: { [STATUS]: async () => (++attempt === 1 ? err(500, "boom") : ok({ enabled: true })), [SUMMARY]: ok(summaryBody(1)) } });
    h.controller.start();
    await h.settle();
    expect(h.state.status).toBe("idle");
    await h.fire();
    expect(h.state.status).toBe("on");
    expect(waitingCount(h.state.summary)).toBe(1);
  });

  it("aba oculta: não consulta; ao voltar a ficar visível, atualiza já", async () => {
    const h = harness({ handlers: on(4), visible: false });
    h.controller.start();
    await h.settle();
    expect(h.calls.length).toBe(0);
    h.env.visible = true;
    h.controller.notifyVisibility();
    await h.settle();
    expect(waitingCount(h.state.summary)).toBe(4);
    expect(h.timers.size).toBe(1);
  });

  it("ficar oculta pausa o agendamento", async () => {
    const h = harness({ handlers: on(4) });
    h.controller.start();
    await h.settle();
    h.env.visible = false;
    h.controller.notifyVisibility();
    expect(h.timers.size).toBe(0);
    await h.fire();
    expect(h.count(SUMMARY)).toBe(1);
  });

  it("start duplicado não duplica chamadas nem timers", async () => {
    const h = harness({ handlers: on() });
    h.controller.start();
    h.controller.start();
    await h.settle();
    expect(h.count(STATUS)).toBe(1);
    expect(h.count(SUMMARY)).toBe(1);
    expect(h.timers.size).toBe(1);
  });

  it("refresh junta-se à rodada em andamento (sem sobreposição)", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = harness({ handlers: { [STATUS]: ok({ enabled: true }), [SUMMARY]: async () => { await gate; return ok(summaryBody(2)); } } });
    h.controller.start();
    await h.settle();
    const a = h.controller.refresh();
    const b = h.controller.refresh();
    release();
    await Promise.all([a, b]);
    expect(h.count(SUMMARY)).toBe(1);
  });

  it("refresh depois de uma ação atualiza o número; sem start, oculto ou desligado não faz nada", async () => {
    let waiting = 3;
    const h = harness({ handlers: { [STATUS]: ok({ enabled: true }), [SUMMARY]: async () => ok(summaryBody(waiting)) } });
    await h.controller.refresh();
    expect(h.calls.length).toBe(0);
    h.controller.start();
    await h.settle();
    waiting = 2;
    await h.controller.refresh();
    expect(waitingCount(h.state.summary)).toBe(2);
    h.env.visible = false;
    await h.controller.refresh();
    expect(h.count(SUMMARY)).toBe(2);

    const off = harness({ handlers: { [STATUS]: ok({ enabled: false }) } });
    off.controller.start();
    await off.settle();
    await off.controller.refresh();
    expect(off.calls.length).toBe(1);
  });

  it("reset (logout ou troca de empresa): zera, para o polling e ignora resposta atrasada", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = harness({ handlers: { [STATUS]: ok({ enabled: true }), [SUMMARY]: async () => { await gate; return ok(summaryBody(8)); } } });
    h.controller.start();
    await h.settle();
    h.controller.reset();
    release();
    await h.settle();
    expect(h.state).toEqual({ status: "idle", summary: null });
    expect(h.timers.size).toBe(0);
    expect(h.controller.isActive()).toBe(false);
  });

  it("stop zera o número e pode recomeçar depois (novo login)", async () => {
    const h = harness({ handlers: on(6) });
    h.controller.start();
    await h.settle();
    h.controller.stop();
    expect(h.state.summary).toBeNull();
    expect(h.timers.size).toBe(0);
    h.controller.start();
    await h.settle();
    expect(waitingCount(h.state.summary)).toBe(6);
  });
});
