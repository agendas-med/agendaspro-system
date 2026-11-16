// Assistente de IA interno (F5-core-B + follow-up 1): normalizadores, rótulos, classificação de erros e validações.
// Puro (sem Nuxt/axios), testável. Contratos: agendaspro-core/docs/contratos-f5b.md e contratos-followup1.md (A1-A9).

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

// created_at/updated_at do core são instantes UTC corretos em ISO-8601 com "Z" (follow-up 1, A6): nunca exiba a
// string crua nem remova o "Z". A conversão usa o fuso da empresa (Brasil: America/Sao_Paulo, o mesmo da agenda),
// injetável para teste. "Hoje"/"ontem" são calculados nesse mesmo fuso.
export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

const zoneFormatters = new Map();
function zoneFormatter(timeZone) {
  if (!zoneFormatters.has(timeZone)) {
    zoneFormatters.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }));
  }
  return zoneFormatters.get(timeZone);
}

// Instante (ISO com Z, Date ou ms) -> partes de data/hora no fuso. null se inválido.
export function zonedParts(value, timeZone = DISPLAY_TIME_ZONE) {
  let ms;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "number") ms = value;
  else {
    const s = toText(value).trim().replace(" ", "T");
    // Sem offset o core não manda; se vier assim, trata como UTC (regra do contrato), nunca como hora local.
    ms = s ? Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s + "Z") : NaN;
  }
  if (!Number.isFinite(ms)) return null;
  const p = {};
  for (const part of zoneFormatter(timeZone).formatToParts(new Date(ms))) p[part.type] = part.value;
  const out = { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
  out.day = Date.UTC(out.y, out.mo - 1, out.d) / 86400000; // número do dia, para comparar hoje/ontem
  return out;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Hoje -> "HH:mm"; senão "DD/MM HH:mm".
export function formatWhen(value, now = new Date(), timeZone = DISPLAY_TIME_ZONE) {
  const w = zonedParts(value, timeZone);
  if (!w) return "";
  const n = zonedParts(now, timeZone);
  const hm = `${pad2(w.h)}:${pad2(w.mi)}`;
  return n && n.day === w.day ? hm : `${pad2(w.d)}/${pad2(w.mo)} ${hm}`;
}

// Lista de conversas: hoje -> "HH:mm", ontem -> "ontem", senão "DD/MM".
export function formatListWhen(value, now = new Date(), timeZone = DISPLAY_TIME_ZONE) {
  const w = zonedParts(value, timeZone);
  if (!w) return "";
  const n = zonedParts(now, timeZone);
  if (n && n.day === w.day) return `${pad2(w.h)}:${pad2(w.mi)}`;
  if (n && n.day - 1 === w.day) return "ontem";
  return `${pad2(w.d)}/${pad2(w.mo)}`;
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

// Origem da resposta (A2): template (core, sem IA: resposta normal), ai ou fallback (a IA falhou).
// Só `degraded` pede aviso: template sozinho NÃO é degradado. O histórico (GET) traz só `source`, então ali
// só o fallback é sinalizado; na resposta ao vivo `degraded` também cobre "ferramenta rodou, a redação falhou".
export function isDegraded(source, degraded) {
  return degraded === true || toText(source) === "fallback";
}

export function degradedNotice(source, degraded) {
  if (!isDegraded(source, degraded)) return "";
  return toText(source) === "fallback"
    ? "Modo degradado: a IA não respondeu desta vez e esta é uma resposta automática simples. Tente de novo em instantes."
    : "Modo degradado: a IA não conseguiu redigir esta resposta; os dados vêm direto do sistema.";
}

// Mensagem do histórico. Desde o follow-up 1 tem `id` (inteiro crescente na conversa); sem id, a chave é a posição.
export function normalizeMessage(raw, index = 0) {
  const r = isObj(raw) ? raw : {};
  const id = toInt(r.id);
  const source = toText(r.source);
  return {
    key: id != null ? `m${id}` : `h${index}`,
    id,
    role: r.role === "user" ? "user" : "assistant",
    content: toText(r.content),
    source,
    degraded: isDegraded(source, false),
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

// Resposta de POST /assistant/actions/:id/token (A4): token novo, mesmo expires_at, params_preview sempre null.
export function normalizeReissuedAction(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    actionId: toText(r.action_id),
    summary: toText(r.summary).trim().slice(0, 500),
    expiresAt: parseInstant(r.expires_at),
    token: typeof r.confirm_token === "string" ? r.confirm_token : "",
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

// usage do core ({interactions_used, interactions_limit, period?}): limite null = ilimitado (A1).
// Vale para GET /assistant/status e para o `usage` da resposta da mensagem.
export function normalizeUsage(raw) {
  const r = isObj(raw) ? raw : {};
  const used = toInt(r.interactions_used);
  if (used == null) return null;
  const view = usageView(used, toInt(r.interactions_limit));
  view.period = toText(r.period);
  return view;
}

// Com uso conhecido e limite null o plano é ilimitado (o medidor não mostra barra nem aviso de limite).
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
    unlimited: u != null && l == null,
    percent,
    remaining: known ? Math.max(0, l - u) : null,
    exhausted,
    near: known && !exhausted && percent >= QUOTA_NEAR_PERCENT,
    tone: exhausted ? "red" : known && percent >= QUOTA_NEAR_PERCENT ? "yellow" : "green",
    period: "",
  };
}

// Motivos de GET /assistant/status -> actions.reason.
export const ACTIONS_REASON_LABELS = {
  assistant_disabled: "O assistente está desligado.",
  not_configured: "As ações estão desativadas no servidor (configuração pendente). Você ainda pode fazer consultas.",
  plan: "Plano somente para consultas: o assistente responde perguntas, mas não executa ações.",
};

export const actionsReasonLabel = (reason) => ACTIONS_REASON_LABELS[toText(reason)] || "";

// GET /assistant/status (A1) -> estado do assistente. Tolerante: tudo opcional; nunca lança.
export function normalizeStatus(raw) {
  const r = isObj(raw) ? raw : {};
  const plan = isObj(r.plan) ? r.plan : {};
  const actions = isObj(r.actions) ? r.actions : {};
  const strings = (list) => (Array.isArray(list) ? list.map(toText).filter(Boolean) : []);
  return {
    enabled: r.enabled === true,
    role: r.role === "admin" ? "admin" : "member",
    planCode: toText(plan.code),
    planName: toText(plan.name),
    usage: normalizeUsage(r.usage),
    // null = não informado: a tela não afirma nada sem saber.
    aiAvailable: typeof r.ai_available === "boolean" ? r.ai_available : null,
    ragEnabled: r.rag_enabled === true,
    actionsEnabled: typeof actions.enabled === "boolean" ? actions.enabled : null,
    actionsReason: toText(actions.reason),
    actionTools: strings(actions.tools),
    readTools: strings(r.read_tools),
    knowledgeAdmin: r.knowledge_admin === true,
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

export const ADMIN_ONLY_MESSAGE = "Apenas administradores gerenciam a base de conhecimento.";

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
 * kind: disabled | actions_disabled | upgrade | rate_limited | budget | forbidden | admin_required | invalid_token | not_found |
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
  // Follow-up 1 (A7): proposta negada (402 de recurso, 403, 503, 400 de ferramenta) não grava a pergunta nem gasta cota.
  if (status === 503 && code === "assistant_actions_disabled") {
    return make("actions_disabled", "As ações do assistente estão desativadas no servidor. Você ainda pode fazer consultas.");
  }
  if (status === 402 && code === "plan_upgrade_required") {
    const feature = coded.feature ? String(coded.feature) : "";
    const quota = coded.quota ? String(coded.quota) : "";
    if (feature) {
      return make("upgrade", serverMessage || "Ações pelo assistente estão disponíveis no plano Premium.", { reason: "feature", feature });
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
    return make("forbidden", serverMessage || "Esta ação exige permissão de administrador.");
  }
  if (status === 403 && code === "invalid_confirm_token") {
    return make("invalid_token", "Esta confirmação não vale mais (outra mais recente foi gerada ou ela foi alterada). Clique em \"Preparar confirmação\" para gerar uma nova.");
  }
  // 403 admin_required (base de conhecimento): o core não derruba a sessão, e a tela mostra o motivo.
  if (status === 403 && code === "admin_required") return make("admin_required", ADMIN_ONLY_MESSAGE);
  if (status === 403) return make("forbidden", serverMessage || "Você não tem permissão para esta ação.");
  if (status === 404) {
    const what = code === "action_not_found" ? "action" : "conversation";
    return make("not_found", what === "action" ? "Esta ação não existe mais." : "Esta conversa não existe mais ou não é sua.", { what });
  }
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
    // Follow-up 1 (A3): "active" decide se o texto entra nas respostas. Ausente = ativo (core antigo).
    active: r.active === undefined || r.active === null ? true : r.active === true || r.active === 1 || r.active === "1" || r.active === "true",
    updatedAt: toText(r.updated_at) || toText(r.created_at),
  };
}

// A lista pode vir como array ou { items }.
export function normalizeKnowledgeList(raw) {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  return list.map(normalizeKnowledgeItem).filter((i) => i.id != null);
}

export function emptyKnowledgeForm() {
  return { id: null, kind: "faq", title: "", content: "", active: true };
}

export function knowledgeFormFromItem(item) {
  return { id: item.id, kind: item.kind || "faq", title: item.title, content: item.content, active: item.active !== false };
}

// Edição: o core aceita PATCH parcial, então só vão os campos que mudaram (título/conteúdo comparados já aparados).
export function knowledgePatch(item, payload) {
  const base = item || {};
  const next = payload || {};
  const patch = {};
  for (const key of ["kind", "title", "content"]) {
    if (key in next && next[key] !== base[key]) patch[key] = next[key];
  }
  if ("active" in next && next.active !== (base.active !== false)) patch.active = next.active;
  return patch;
}

// O core valida com Joi; no PATCH basta enviar o que mudou, no POST vai o corpo completo.
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
  return { ok: true, errors, payload: { kind: f.kind, title, content, active: f.active !== false } };
}

// Erros da base de conhecimento (follow-up 1, A5): vêm com código em { error: { code, message, ... } }.
// 400 validation_error traz `fields` (e `errors[]` legado) para marcar o campo; 409 traz `limit`.
// Cada texto vindo do servidor é exibido como texto puro.
export function classifyKnowledgeError(error) {
  const status = error && error.response && error.response.status;
  const body = error && error.response && error.response.data;
  const coded = codedBody(error);
  const code = coded && typeof coded.code === "string" ? coded.code : "";
  const text = isObj(body)
    ? (coded ? toText(coded.message) : typeof body.message === "string" ? body.message : "")
    : "";
  if (!error || !error.response) return { kind: "network", message: "Não foi possível conectar ao servidor. Verifique sua conexão." };
  if (isAssistantDisabled(error)) return { kind: "disabled", message: "O assistente não está disponível para esta empresa." };
  if (status === 403 && code === "admin_required") return { kind: "forbidden", message: ADMIN_ONLY_MESSAGE };
  if (status === 401) return { kind: "unauthorized", message: "Sua sessão expirou. Entre novamente." };
  if (status === 403) return { kind: "forbidden", message: ADMIN_ONLY_MESSAGE };
  if (status === 404) return { kind: "not_found", message: "Este texto não existe mais. Atualize a lista." };
  if (status === 400 || status === 422) {
    const raw = coded && Array.isArray(coded.fields) ? coded.fields : isObj(body) && Array.isArray(body.errors) ? body.errors : [];
    const fields = {};
    for (const f of raw) {
      if (!isObj(f)) continue;
      const name = toText(f.field);
      const msg = toText(f.message);
      if (name && msg && !fields[name]) fields[name] = msg;
    }
    const known = ["kind", "title", "content", "active"];
    const mapped = Object.fromEntries(Object.entries(fields).filter(([k]) => known.includes(k)));
    return {
      kind: "validation",
      message: text || Object.values(fields)[0] || "Dados inválidos. Revise os campos.",
      fields: mapped,
      hasFieldErrors: Object.keys(mapped).length > 0,
    };
  }
  if (status === 409) {
    const limit = coded ? toInt(coded.limit) : null;
    return { kind: "limit", message: text || `A base chegou ao limite de ${limit || KNOWLEDGE_MAX_ITEMS} textos.`, limit: limit || KNOWLEDGE_MAX_ITEMS };
  }
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
