// Execução do fluxo OAuth (conectar e concluir o retorno) compartilhada por Instagram e Google Agenda.
// Puro: `api`, storage, origem, navegação e relógio são injetados (testável sem navegador).
//
// Segurança:
//  - a authorize_url só é seguida se for https no domínio do provedor (ou http local em desenvolvimento);
//  - o pedido (state, empresa, hora) é guardado em sessionStorage e conferido no retorno;
//  - o state é de uso único: o pedido guardado é apagado ANTES do POST /callback, e o mesmo state nunca
//    dispara duas chamadas (montagem dupla da página não reenvia o code);
//  - nenhum token ou code é registrado em log.
import { classifyIntegrationError } from "./integrations.js";
import {
  providerConfig, redirectUriFor, safeAuthorizeUrl, parseOauthCallback,
  savePending, readPending, clearPending, checkPending,
} from "./oauth.js";
import { unwrap } from "./payloads.js";

const fail = (message, kind, extra = {}) => ({ ok: false, kind, message, ...extra });

export function createOauthFlow({
  api,
  provider,
  storage = null,
  origin = () => "",
  navigate = () => {},
  allowLocal = false,
  companyId = () => "",
  now = () => Date.now(),
}) {
  const cfg = providerConfig(provider);
  const inflight = new Map(); // state -> Promise (idempotência por state)
  const done = new Map(); // state -> resultado final

  // Inicia a conexão: pede a authorize_url ao core e leva o navegador até o provedor.
  // Ação explícita do admin: um 402 (Google exige Premium) pode abrir o modal global de upgrade.
  async function connect() {
    if (!cfg) return fail("Integração desconhecida.", "server");
    const redirectUri = redirectUriFor(provider, origin());
    if (!redirectUri) return fail("Não foi possível identificar o endereço do painel.", "server");
    try {
      const response = await api.post(`${cfg.apiBase}/connect/start`, { redirect_uri: redirectUri });
      const data = unwrap(response) || {};
      const url = safeAuthorizeUrl(provider, data.authorize_url, { allowLocal });
      if (!url || typeof data.state !== "string" || !data.state) {
        return fail(`O servidor devolveu um endereço de autorização inválido para ${cfg.name}.`, "server");
      }
      savePending(storage, provider, { state: data.state, companyId: companyId(), now: now() });
      navigate(url);
      return { ok: true, redirected: true };
    } catch (error) {
      const c = classifyIntegrationError(error, { provider, now: now() });
      return fail(c.message, c.kind, { classified: c });
    }
  }

  // Conclui o retorno do provedor. `query` é a query da rota de callback. A página deve limpar a URL antes de chamar.
  function complete(query) {
    const parsed = parseOauthCallback(query);
    if (parsed.kind === "none") return Promise.resolve(fail("Nenhum retorno de autorização encontrado.", "none"));
    if (parsed.kind === "denied") {
      clearPending(storage, provider);
      return Promise.resolve(fail(parsed.reason, "denied"));
    }
    if (parsed.kind === "error") {
      clearPending(storage, provider);
      return Promise.resolve(fail(parsed.reason, "callback_error"));
    }
    const { code, state } = parsed;
    if (done.has(state)) return Promise.resolve(done.get(state));
    if (inflight.has(state)) return inflight.get(state);

    const run = (async () => {
      const check = checkPending(readPending(storage, provider), { state, companyId: companyId(), now: now() });
      clearPending(storage, provider);
      if (!check.ok) return fail(check.reason, "state_mismatch");
      try {
        const response = await api.post(`${cfg.apiBase}/callback`, { code, state });
        return { ok: true, data: unwrap(response) || {} };
      } catch (error) {
        const c = classifyIntegrationError(error, { provider, now: now() });
        return fail(c.message, c.kind, { classified: c });
      }
    })().then((result) => {
      done.set(state, result);
      inflight.delete(state);
      return result;
    });
    inflight.set(state, run);
    return run;
  }

  function reset() {
    inflight.clear();
    done.clear();
  }

  return { connect, complete, reset };
}
