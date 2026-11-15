import { describe, it, expect, vi } from "vitest";
import { createPoller } from "../utils/whatsapp.js";

// Relógio e visibilidade falsos: o poller recebe timers e isVisible injetados.
function harness({ visible = true, task = vi.fn(async () => {}), onError } = {}) {
  const state = { visible, timers: new Map(), next: 1 };
  const setTimer = (fn, ms) => {
    const id = state.next++;
    state.timers.set(id, { fn, ms });
    return id;
  };
  const clearTimer = (id) => state.timers.delete(id);
  const poller = createPoller({ task, intervalMs: 15000, isVisible: () => state.visible, setTimer, clearTimer, onError });
  const fire = async () => {
    const [id, t] = [...state.timers.entries()][0] || [];
    if (!t) return false;
    state.timers.delete(id);
    await t.fn();
    return true;
  };
  return { state, poller, task, fire };
}

describe("createPoller", () => {
  it("agenda a cada 15 s e repete depois de cada execução", async () => {
    const h = harness();
    h.poller.start();
    expect([...h.state.timers.values()].map((t) => t.ms)).toEqual([15000]);
    expect(h.task).not.toHaveBeenCalled();
    await h.fire();
    expect(h.task).toHaveBeenCalledTimes(1);
    expect(h.state.timers.size).toBe(1);
    await h.fire();
    expect(h.task).toHaveBeenCalledTimes(2);
  });

  it("aba oculta: não executa nem reagenda (pausa)", async () => {
    const h = harness();
    h.poller.start();
    h.state.visible = false;
    await h.fire();
    expect(h.task).not.toHaveBeenCalled();
    expect(h.state.timers.size).toBe(0);
  });

  it("ficar oculta cancela o timer pendente", () => {
    const h = harness();
    h.poller.start();
    h.state.visible = false;
    h.poller.notifyVisibility();
    expect(h.state.timers.size).toBe(0);
  });

  it("voltar a ficar visível atualiza já e retoma o intervalo", async () => {
    const h = harness();
    h.poller.start();
    h.state.visible = false;
    await h.fire();
    h.state.visible = true;
    h.poller.notifyVisibility();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.task).toHaveBeenCalledTimes(1);
    expect(h.state.timers.size).toBe(1);
  });

  it("não sobrepõe execuções em andamento", async () => {
    let release;
    const slow = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const h = harness({ task: slow });
    h.poller.start();
    const running = h.fire();
    h.poller.notifyVisibility(); // não dispara outra enquanto a primeira não terminou
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await running;
    expect(h.state.timers.size).toBe(1);
  });

  it("erro da tarefa é silencioso (não derruba nem interrompe o ciclo)", async () => {
    const onError = vi.fn();
    const h = harness({ task: vi.fn(async () => { throw new Error("rede"); }), onError });
    h.poller.start();
    await h.fire();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(h.state.timers.size).toBe(1);
  });

  it("stop cancela o timer e nenhuma execução tardia acontece", async () => {
    const h = harness();
    h.poller.start();
    h.poller.stop();
    expect(h.state.timers.size).toBe(0);
    expect(h.poller.isRunning()).toBe(false);
    h.poller.notifyVisibility();
    expect(h.task).not.toHaveBeenCalled();
  });

  it("stop durante a execução não reagenda", async () => {
    let release;
    const h = harness({ task: vi.fn(() => new Promise((resolve) => { release = resolve; })) });
    h.poller.start();
    const running = h.fire();
    h.poller.stop();
    release();
    await running;
    expect(h.state.timers.size).toBe(0);
  });

  it("start duplicado não cria timers duplicados", () => {
    const h = harness();
    h.poller.start();
    h.poller.start();
    expect(h.state.timers.size).toBe(1);
  });
});
