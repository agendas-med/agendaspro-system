// Selo de conversas do WhatsApp aguardando atendimento (menu e aba "Conversas").
// Contrato: GET /whatsapp/conversations/summary (core, follow-up 1) -> { total, bot, human, waiting, assumed, mine,
// opted_out, unread_conversations, unread_messages }. "Aguardando" = modo humano sem atendente (o que alguém precisa
// pegar); é o número do selo. As não lidas ficam no estado (unreadConversations) mas não entram no selo: o painel
// ainda não marca conversa como lida, então o número só cairia ao responder.
//
// Polling barato: 1 chamada leve a cada 60 s, só com a aba visível, sem sobreposição, e só se o WhatsApp estiver
// ligado (GET /whatsapp/status uma vez; desligado, 403/404/402 = sem polling até o próximo login).
import { unwrap } from "./payloads.js";
import { createPoller, normalizeStatus } from "./whatsapp.js";

export const BADGE_POLL_MS = 60000;
export const BADGE_CAP = 99;

const PASSIVE = { suppressUpgradePrompt: true };
const STATUS_PATH = "/whatsapp/status";
const SUMMARY_PATH = "/whatsapp/conversations/summary";
// Respostas que significam "este recurso não é para mim": para de consultar.
const PERMANENT = [401, 402, 403, 404];

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

export function normalizeSummary(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    total: count(r.total),
    bot: count(r.bot),
    human: count(r.human),
    waiting: count(r.waiting),
    assumed: count(r.assumed),
    mine: count(r.mine),
    optedOut: count(r.opted_out),
    unreadConversations: count(r.unread_conversations),
    unreadMessages: count(r.unread_messages),
  };
}

export function waitingCount(summary) {
  return summary ? count(summary.waiting) : 0;
}

// "" (nada a mostrar), "7" ou "99+".
export function badgeText(value) {
  const n = count(value);
  if (n === 0) return "";
  return n > BADGE_CAP ? `${BADGE_CAP}+` : String(n);
}

// Texto para leitor de tela (o número visual fica aria-hidden).
export function badgeLabel(value) {
  const n = count(value);
  if (n === 0) return "";
  if (n > BADGE_CAP) return `mais de ${BADGE_CAP} conversas aguardando atendimento`;
  return n === 1 ? "1 conversa aguardando atendimento" : `${n} conversas aguardando atendimento`;
}

export function initialBadgeState() {
  // idle (não iniciado) | on (WhatsApp ligado, consultando) | off (desligado/indisponível: sem polling)
  return { status: "idle", summary: null };
}

export function createBadgeController({
  api,
  state = initialBadgeState(),
  intervalMs = BADGE_POLL_MS,
  isVisible = () => true,
  setTimer,
  clearTimer,
} = {}) {
  let epoch = 0; // invalida respostas que chegam depois de stop()/reset()
  let started = false;
  let inflight = null;

  const poller = createPoller({ task: () => run(), intervalMs, isVisible, setTimer, clearTimer });

  function turnOff() {
    state.status = "off";
    state.summary = null;
    started = false;
    poller.stop();
  }

  // Uma rodada: confirma que o WhatsApp está ligado (uma vez) e lê as contagens. Chamadas simultâneas se juntam.
  function run() {
    if (inflight) return inflight;
    const my = epoch;
    const current = (async () => {
      try {
        if (state.status !== "on") {
          const res = await api.get(STATUS_PATH, PASSIVE);
          if (my !== epoch) return;
          if (!normalizeStatus(unwrap(res)).enabled) return turnOff();
          state.status = "on";
        }
        const res = await api.get(SUMMARY_PATH, PASSIVE);
        if (my !== epoch) return;
        state.summary = normalizeSummary(unwrap(res));
      } catch (error) {
        if (my !== epoch) return;
        const status = error && error.response && error.response.status;
        if (PERMANENT.includes(status)) turnOff();
        // rede/5xx: silencioso, a próxima rodada tenta de novo
      } finally {
        if (inflight === current) inflight = null;
      }
    })();
    inflight = current;
    return current;
  }

  return {
    state,
    // Liga o selo (item de menu visível e permitido). Primeira leitura imediata; depois, a cada intervalMs.
    start() {
      if (started || state.status === "off") return;
      started = true;
      poller.start();
      if (isVisible()) run();
    },
    // Menu saiu da tela (troca de layout): para tudo e esquece o número.
    stop() {
      epoch += 1;
      started = false;
      inflight = null;
      poller.stop();
      Object.assign(state, initialBadgeState());
    },
    // Logout / troca de empresa: nada do tenant anterior sobrevive.
    reset() {
      this.stop();
    },
    // Depois de uma ação do usuário (assumir, liberar, responder): atualiza já, sem esperar o intervalo.
    refresh() {
      if (!started || state.status === "off" || !isVisible()) return Promise.resolve();
      return run();
    },
    notifyVisibility() {
      poller.notifyVisibility();
    },
    isActive: () => started,
  };
}
