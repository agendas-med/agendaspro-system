// Assistente de IA interno (F5-core-B): normalizadores, rótulos, classificação de erros e validações.
// Puro (sem Nuxt/axios), testável. Contrato: agendaspro-core/docs/contratos-f5b.md.
import { coreWall } from "./payloads.js";
import { formatMessageTime, formatListTime } from "./whatsapp.js";

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_KNOWLEDGE_TITLE = 160;
export const MAX_KNOWLEDGE_CONTENT = 4000;
export const KNOWLEDGE_MAX_ITEMS = 500;
export const QUOTA_NEAR_PERCENT = 80;
// Mensagem e confirmação podem esperar duas chamadas à IA: o padrão do cliente (15 s) é curto demais.
export const LONG_REQUEST_TIMEOUT_MS = 45000;
export const DEFAULT_RETRY_AFTER_SECONDS = 30;
export const MAX_RETRY_AFTER_SECONDS = 300;
export const DUPLICATE_SEND_WINDOW_MS = 1500;

const toText = (v) => (v == null ? "" : String(v));
const toInt = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

// created_at do core: DATETIME lido com o pool em -03:00 fixo e serializado com "Z" (ver coreWall).
export function formatWhen(value, now = new Date()) {
  return formatMessageTime(coreWall(value), now);
}
export function formatListWhen(value, now = new Date()) {
  return formatListTime(coreWall(value), now);
}

// expires_at das ações é um instante real (new Date(ms).toISOString()). Devolve ms ou null.
export function parseInstant(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const s = toText(value).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

// "9:05" / "0:42"; vazio se já passou.
export function formatCountdown(expiresAt, now = Date.now()) {
  if (expiresAt == null) return "";
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export const isExpired = (expiresAt, now = Date.now()) => expiresAt != null && now >= expiresAt;

// ---------------------------------------------------------------------------
// Conversas e mensagens
// ---------------------------------------------------------------------------

export function normalizeConversation(raw) {
  const r = isObj(raw) ? raw : {};
  const title = toText(r.title).trim();
  return {
    id: toText(r.id),
    title,
    messageCount: Math.max(0, toInt(r.message_count) || 0),
    createdAt: toText(r.created_at),
    updatedAt: toText(r.updated_at) || toText(r.created_at),
  };
}

export const conversationLabel = (conv) => (conv && conv.title) || "Nova conversa";

export function normalizeConversations(list) {
  const items = (Array.isArray(list) ? list : []).map(normalizeConversation).filter((c) => c.id);
  return items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// Rótulos da origem da resposta (assistant_messages.source). Só o histórico traz esse campo.
export const SOURCE_LABELS = {
  ai: "Resposta da IA",
  template: "Consulta direta (sem IA)",
  fallback: "Resposta automática: a IA não respondeu",
};

export function sourceLabel(source) {
  return SOURCE_LABELS[toText(source)] || "";
}

// Mensagem do histórico (sem id no core: a chave é a posição).
export function normalizeMessage(raw, index = 0) {
  const r = isObj(raw) ? raw : {};
  return {
    key: `h${index}`,
    role: r.role === "user" ? "user" : "assistant",
    content: toText(r.content),
    source: toText(r.source),
    intent: toText(r.intent),
    createdAt: toText(r.created_at),
    state: "ok",
    citations: [],
    truncated: false,
  };
}

export function normalizeMessages(list) {
  return (Array.isArray(list) ? list : []).map(normalizeMessage);
}

// Histórico completo de GET /assistant/conversations/:id.
export function normalizeConversationDetail(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    conversation: normalizeConversation(r),
    messages: normalizeMessages(r.messages),
    pending: (Array.isArray(r.pending_actions) ? r.pending_actions : []).map(normalizePendingAction).filter((a) => a.actionId),
  };
}

// ---------------------------------------------------------------------------
// Citações (RAG)
// ---------------------------------------------------------------------------

export const SOURCE_TYPE_LABELS = {
  knowledge: "Base de conhecimento",
  service: "Serviço",
  company: "Dados da empresa",
  appointment_note: "Observação de agendamento",
};

export function normalizeCitations(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!isObj(raw)) continue;
    const type = toText(raw.source_type);
    const id = toText(raw.source_id);
    const key = `${type}:${id}`;
    if (!type || seen.has(key)) continue;
    seen.add(key);
    const score = Number(raw.score);
    out.push({
      key,
      type,
      sourceId: id,
      label: SOURCE_TYPE_LABELS[type] || "Fonte",
      score: Number.isFinite(score) ? score : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ações propostas
// ---------------------------------------------------------------------------

export const TOOL_LABELS = {
  create_appointment: "Criar agendamento",
  update_appointment: "Alterar agendamento",
  cancel_appointment: "Cancelar agendamento",
  adjust_stock: "Ajustar estoque",
  create_service: "Criar serviço",
  update_service: "Alterar serviço",
  create_product: "Criar produto",
  update_product: "Alterar produto",
  create_customer: "Cadastrar cliente",
  block_time: "Bloquear horário",
};

export const toolLabel = (tool) => TOOL_LABELS[toText(tool)] || "Ação do assistente";

export const RISK_LABELS = { low: "Risco baixo", medium: "Risco médio" };
export const riskLabel = (risk) => RISK_LABELS[toText(risk)] || "Risco não informado";
export const riskTone = (risk) => (risk === "medium" ? "yellow" : "green");

const PARAM_LABELS = {
  customer: "Cliente",
  customer_name: "Cliente",
  customer_id: "Cliente",
  client_name: "Cliente",
  service: "Serviço",
  service_name: "Serviço",
  service_id: "Serviço",
  professional: "Profissional",
  professional_name: "Profissional",
  professional_id: "Profissional",
  product: "Produto",
  product_name: "Produto",
  name: "Nome",
  title: "Título",
  date: "Data",
  start: "Início",
  end: "Fim",
  starts_at: "Início",
  ends_at: "Fim",
  time: "Horário",
  duration: "Duração",
  duration_minutes: "Duração (min)",
  price: "Preço",
  quantity: "Quantidade",
  delta: "Variação",
  amount: "Valor",
  phone: "Telefone",
  reason: "Motivo",
  notes: "Observações",
  note: "Observação",
  description: "Descrição",
  status: "Situação",
  appointment_id: "Agendamento",
};

const HIDDEN_PARAM = /token|secret|password|senha|company_id|user_id|hash/i;
const MAX_PREVIEW_ROWS = 12;
const MAX_PREVIEW_VALUE = 200;

function humanizeKey(key) {
  const s = toText(key).replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function previewValue(value, depth = 0) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().slice(0, MAX_PREVIEW_VALUE);
  if (depth >= 1) return "";
  if (Array.isArray(value)) return value.map((v) => previewValue(v, depth + 1)).filter(Boolean).join(", ").slice(0, MAX_PREVIEW_VALUE);
  if (isObj(value)) {
    return Object.entries(value)
      .filter(([k]) => !HIDDEN_PARAM.test(k))
      .map(([k, v]) => {
        const text = previewValue(v, depth + 1);
        return text ? `${PARAM_LABELS[k] || humanizeKey(k)}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ")
      .slice(0, MAX_PREVIEW_VALUE);
  }
  return "";
}

// params_preview -> linhas legíveis {label, value}. Valores sempre como texto (renderizados com {{ }}).
export function previewRows(preview) {
  if (!isObj(preview)) return [];
  const rows = [];
  for (const [key, value] of Object.entries(preview)) {
    if (HIDDEN_PARAM.test(key)) continue;
    const text = previewValue(value);
    if (!text) continue;
    rows.push({ key, label: PARAM_LABELS[key] || humanizeKey(key), value: text });
    if (rows.length >= MAX_PREVIEW_ROWS) break;
  }
  return rows;
}

function baseAction(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    actionId: toText(r.action_id),
    tool: toText(r.tool),
    summary: toText(r.summary).trim().slice(0, 500),
    risk: toText(r.risk),
    expiresAt: parseInstant(r.expires_at),
  };
}

// Ação restaurada do histórico: sem confirm_token (o core só o entrega uma vez, na resposta da mensagem).
export function normalizePendingAction(raw) {
  return { ...baseAction(raw), paramsPreview: null, token: "", state: "pending", result: null, error: "", anchor: "" };
}

// Ação da resposta da mensagem: traz o token, que fica apenas em memória.
export function normalizeProposedAction(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    ...baseAction(raw),
    paramsPreview: isObj(r.params_preview) ? r.params_preview : null,
    token: typeof r.confirm_token === "string" ? r.confirm_token : "",
    state: "pending",
    result: null,
    error: "",
    anchor: "",
  };
}

export const ACTION_STATES = {
  pending: "Aguardando sua decisão",
  confirming: "Executando...",
  rejecting: "Rejeitando...",
  executed: "Executada",
  rejected: "Rejeitada",
  expired: "Expirada",
  failed: "Não executada",
  processed: "Já processada",
  unknown: "Resultado incerto",
  gone: "Não encontrada",
  denied: "Sem permissão",
};

export const actionStateLabel = (state) => ACTION_STATES[state] || "";
export const ACTION_FINAL_STATES = ["executed", "rejected", "expired", "failed", "processed", "gone", "denied"];
export const isActionFinal = (state) => ACTION_FINAL_STATES.includes(state);

// Resultado da execução (resposta do confirm): só texto seguro; o resumo do core vem pronto.
export function normalizeConfirmResult(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    actionId: toText(r.action_id),
    status: toText(r.status),
    tool: toText(r.tool),
    summary: toText(r.summary).trim().slice(0, 500),
    rows: previewRows(isObj(r.result) ? r.result : null),
  };
}

// ---------------------------------------------------------------------------
// Cota e plano
// ---------------------------------------------------------------------------

// usage da resposta da mensagem: { interactions_used, interactions_limit }.
export function normalizeUsage(raw, planLimit = null) {
  const r = isObj(raw) ? raw : {};
  const used = toInt(r.interactions_used);
  const limit = r.interactions_limit == null ? toInt(planLimit) : toInt(r.interactions_limit);
  if (used == null && limit == null) return null;
  return usageView(used, limit);
}

export function usageView(used, limit) {
  const u = used == null ? null : Math.max(0, used);
  const l = limit == null ? null : Math.max(0, limit);
  const known = u != null && l != null;
  const percent = known ? (l > 0 ? Math.min(100, Math.round((u / l) * 100)) : 100) : 0;
  const exhausted = known && u >= l;
  return {
    used: u,
    limit: l,
    known,
    percent,
    remaining: known ? Math.max(0, l - u) : null,
    exhausted,
    near: known && !exhausted && percent >= QUOTA_NEAR_PERCENT,
    tone: exhausted ? "red" : known && percent >= QUOTA_NEAR_PERCENT ? "yellow" : "green",
  };
}

// GET /billing/subscription -> o que o assistente precisa (tolerante: tudo opcional).
export function planFromSubscription(raw) {
  const r = isObj(raw) ? raw : {};
  const ent = isObj(r.entitlement) ? r.entitlement : {};
  const features = isObj(ent.features) ? ent.features : {};
  const limit = toInt(features.assistant_monthly_interactions);
  const actions = features.assistant_actions;
  return {
    planCode: toText(ent.plan_code),
    planName: toText(ent.plan_name),
    monthlyLimit: limit,
    // null = não informado: a tela não afirma "somente leitura" sem saber.
    actionsEnabled: typeof actions === "boolean" ? actions : null,
  };
}

// ---------------------------------------------------------------------------
// Envio: validação
// ---------------------------------------------------------------------------

export function validateMessage(text) {
  const value = toText(text).trim();
  if (!value) return { ok: false, error: "Digite uma mensagem." };
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `A mensagem pode ter até ${MAX_MESSAGE_LENGTH} caracteres.` };
  }
  return { ok: true, text: value };
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function codedBody(error) {
  const body = error && error.response && error.response.data;
  return isObj(body) && isObj(body.error) ? body.error : null;
}

export const isAssistantDisabled = (error) => {
  const status = error && error.response && error.response.status;
  const coded = codedBody(error);
  return status === 503 && !!coded && coded.code === "assistant_disabled";
};

// Segundos de espera de um 429: corpo (retry_after) primeiro, pois o CORS do core não expõe o header Retry-After.
export function retryAfterSeconds(error) {
  const coded = codedBody(error) || {};
  const headers = (error && error.response && error.response.headers) || {};
  const fromHeader = typeof headers.get === "function" ? headers.get("retry-after") : headers["retry-after"];
  const n = toInt(coded.retry_after) ?? toInt(fromHeader);
  if (n == null || n <= 0) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(n, MAX_RETRY_AFTER_SECONDS);
}

/**
 * Classifica o erro de uma chamada do assistente.
 * kind: disabled | actions_disabled | upgrade | rate_limited | budget | forbidden | invalid_token | not_found |
 *       processed | expired | failed | validation | unauthorized | unavailable | network | server | generic
 * accepted: true (o core processou/gravou a mensagem), false (rejeitada antes de gravar) ou null (incerto).
 * outcomeUnknown: o resultado é incerto (timeout, rede, 5xx sem código): nunca reenviar sem reconciliar.
 */
export function classifyAssistantError(error) {
  const status = error && error.response && error.response.status;
  const coded = codedBody(error);
  const code = coded && typeof coded.code === "string" ? coded.code : "";
  const serverMessage = coded && typeof coded.message === "string" ? coded.message.trim() : "";
  const make = (kind, message, extra = {}) => ({ kind, message, accepted: false, outcomeUnknown: false, handledGlobally: !!(error && error.handledGlobally), ...extra });

  if (!error || !error.response) {
    const timeout = error && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" || /timeout/i.test(error.message || ""));
    return make(timeout ? "timeout" : "network", timeout
      ? "O assistente demorou para responder. Vou conferir se a mensagem chegou antes de você tentar de novo."
      : "Não foi possível conectar ao servidor. Verifique sua conexão com a internet.", { accepted: null, outcomeUnknown: true, retryable: true });
  }

  if (status === 503 && code === "assistant_disabled") return make("disabled", "O assistente não está disponível para esta empresa no momento.");
  if (status === 503 && code === "assistant_actions_disabled") {
    return make("actions_disabled", "As ações do assistente estão desativadas no servidor. Você ainda pode fazer consultas.", { accepted: true });
  }
  if (status === 402 && code === "plan_upgrade_required") {
    const feature = coded.feature ? String(coded.feature) : "";
    const quota = coded.quota ? String(coded.quota) : "";
    if (feature) {
      return make("upgrade", serverMessage || "Ações pelo assistente estão disponíveis no plano Premium.", { reason: "feature", feature, accepted: null });
    }
    return make("upgrade", serverMessage || "O limite mensal de interações do assistente foi atingido.", {
      reason: "quota", quota, limit: toInt(coded.limit), used: toInt(coded.used),
    });
  }
  if (status === 429 && code === "assistant_budget_exceeded") {
    return make("budget", "O limite de uso de IA foi atingido. Perguntas simples (agenda, estoque, faturamento) continuam funcionando.");
  }
  if (status === 429) {
    const seconds = retryAfterSeconds(error);
    return make("rate_limited", `Muitas mensagens em pouco tempo. Aguarde ${seconds} s para enviar de novo.`, { retryAfter: seconds });
  }
  if (status === 403 && code === "assistant_forbidden") {
    return make("forbidden", serverMessage || "Esta ação exige permissão de administrador.", { accepted: null });
  }
  if (status === 403 && code === "invalid_confirm_token") {
    return make("invalid_token", "Não foi possível validar esta confirmação. Peça a ação novamente ao assistente.");
  }
  if (status === 403) return make("forbidden", serverMessage || "Você não tem permissão para esta ação.");
  if (status === 404) return make("not_found", code === "action_not_found" ? "Esta ação não existe mais." : "Esta conversa não existe mais ou não é sua.");
  if (status === 409 && code === "action_already_processed") {
    return make("processed", "Esta ação já foi processada (confirmada, rejeitada ou recusada). Veja o resultado na sua agenda ou peça de novo.");
  }
  if (status === 410 || code === "action_expired") return make("expired", "Esta ação expirou. Peça novamente ao assistente.");
  if (status === 422 && code === "action_failed") {
    return make("failed", serverMessage || "O sistema não conseguiu executar esta ação.");
  }
  if (status === 400 || status === 422) return make("validation", serverMessage || "Mensagem inválida. Revise o texto e tente novamente.");
  if (status === 401) return make("unauthorized", "Sua sessão expirou. Entre novamente.", { accepted: null });
  // 5xx sem código: dyno dormindo/queda; com código (ex.: 500 interno): falha do servidor. Resultado incerto nos dois casos.
  if (status >= 500) {
    return make(code ? "server" : "unavailable", "O serviço está indisponível agora. Tente novamente em instantes.", { accepted: null, outcomeUnknown: true, retryable: true });
  }
  return make("generic", serverMessage);
}

// ---------------------------------------------------------------------------
// Base de conhecimento (RAG)
// ---------------------------------------------------------------------------

export const KNOWLEDGE_KINDS = [
  { value: "faq", label: "Pergunta frequente" },
  { value: "policy", label: "Política" },
  { value: "rule", label: "Regra" },
  { value: "template", label: "Modelo de resposta" },
];

export const knowledgeKindLabel = (kind) => (KNOWLEDGE_KINDS.find((k) => k.value === kind) || {}).label || "Texto";

export function normalizeKnowledgeItem(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    id: toInt(r.id),
    kind: toText(r.kind),
    title: toText(r.title),
    content: toText(r.content),
    updatedAt: toText(r.updated_at) || toText(r.created_at),
  };
}

// A lista pode vir como array ou { items }.
export function normalizeKnowledgeList(raw) {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  return list.map(normalizeKnowledgeItem).filter((i) => i.id != null);
}

export function emptyKnowledgeForm() {
  return { id: null, kind: "faq", title: "", content: "" };
}

export function knowledgeFormFromItem(item) {
  return { id: item.id, kind: item.kind || "faq", title: item.title, content: item.content };
}

// O core valida com Joi e exige o corpo completo também no PUT (sem PATCH).
export function validateKnowledgeForm(form) {
  const f = form || {};
  const errors = {};
  const title = toText(f.title).trim();
  const content = toText(f.content).trim();
  if (!KNOWLEDGE_KINDS.some((k) => k.value === f.kind)) errors.kind = "Escolha um tipo.";
  if (!title) errors.title = "Informe um título.";
  else if (title.length > MAX_KNOWLEDGE_TITLE) errors.title = `O título pode ter até ${MAX_KNOWLEDGE_TITLE} caracteres.`;
  if (!content) errors.content = "Informe o conteúdo.";
  else if (content.length > MAX_KNOWLEDGE_CONTENT) errors.content = `O conteúdo pode ter até ${MAX_KNOWLEDGE_CONTENT} caracteres.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, errors, payload: { kind: f.kind, title, content } };
}

// Os erros da base de conhecimento do core NÃO têm código ({ message }): só o status discrimina.
export function classifyKnowledgeError(error) {
  const status = error && error.response && error.response.status;
  const body = error && error.response && error.response.data;
  const text = isObj(body) ? (typeof body.message === "string" ? body.message : isObj(body.error) ? toText(body.error.message) : "") : "";
  if (!error || !error.response) return { kind: "network", message: "Não foi possível conectar ao servidor. Verifique sua conexão." };
  if (isAssistantDisabled(error)) return { kind: "disabled", message: "O assistente não está disponível para esta empresa." };
  if (status === 401 || status === 403) return { kind: "forbidden", message: "Apenas administradores gerenciam a base de conhecimento." };
  if (status === 404) return { kind: "not_found", message: "Este texto não existe mais. Atualize a lista." };
  if (status === 400 || status === 422) return { kind: "validation", message: text || "Dados inválidos. Revise os campos." };
  if (status === 409) return { kind: "limit", message: text || `A base chegou ao limite de ${KNOWLEDGE_MAX_ITEMS} textos.` };
  if (status === 402) return { kind: "upgrade", message: text || "Seu plano não permite esta ação.", handledGlobally: !!error.handledGlobally };
  if (status >= 500) return { kind: "unavailable", message: "O serviço está indisponível agora. Tente novamente em instantes." };
  return { kind: "generic", message: text };
}

// ---------------------------------------------------------------------------
// Links do texto da IA
// ---------------------------------------------------------------------------

// Domínios (próprios) permitidos nos links do texto da IA; caminhos internos do painel são sempre permitidos.
export function linkOptions(config = {}) {
  const hosts = String(config.allowedHosts || "agendaspro.com.br")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return { allowedHosts: hosts, allowRelative: true, allowLocalHttp: !!config.allowLocalHttp };
}
