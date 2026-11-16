// Integração com o Instagram (F6): estados, normalização das respostas do core, métricas legíveis,
// funil de conversão e gerador de link UTM. Tudo puro (sem Nuxt). Texto vindo do Instagram (legenda,
// nome, usuário) é tratado como texto puro: nunca HTML.
import { safeHttpsUrl } from "./integrations.js";
import { cleanText } from "./safeText.js";

export const IG_FEATURE = "instagram";
export const FREE_POSTS_LIMIT = 6;

// ---- Números e rótulos -------------------------------------------------------

const toNum = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// 1234 -> "1,2 mil"; 2_500_000 -> "2,5 mi"; ausente -> "—".
export function formatCount(value) {
  const n = toNum(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  const fmt = (x) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} mi`;
  if (abs >= 10_000) return `${fmt(n / 1000)} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// 0.0532 -> "5,32%". Ausente -> "—".
export function formatRate(rate) {
  const n = toNum(rate);
  if (n === null) return "—";
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

const MEDIA_LABELS = { IMAGE: "Foto", VIDEO: "Vídeo", CAROUSEL_ALBUM: "Carrossel", REELS: "Reels", STORY: "Story", OTHER: "Outro" };
export function mediaTypeLabel(type) {
  return MEDIA_LABELS[type] || MEDIA_LABELS.OTHER;
}

// Legenda segura e curta para o cartão (texto puro, sem controles/bidi).
export function truncateCaption(caption, max = 110) {
  const text = cleanText(typeof caption === "string" ? caption : "", 2200).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const ENGAGEMENT_FORMULA =
  "Taxa de engajamento = interações (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance do post. " +
  "Sem alcance disponível, usa os seguidores no lugar do alcance. Na conta, soma as interações dos posts considerados e divide pela soma dos alcances.";

export function engagementBasisLabel(basis) {
  if (basis === "reach") return "sobre o alcance";
  if (basis === "followers") return "sobre os seguidores";
  return "";
}

// ---- Conexão ------------------------------------------------------------------

// Estado único da tela: loading | not_configured | disconnected | connecting | connected | reauth_required | error
export function connectionState({ loaded, loading, connecting, configured, connected, account, error } = {}) {
  if (connecting) return "connecting";
  if (error && !connected) return "error";
  if (!loaded || loading) return "loading";
  if (configured === false) return "not_configured";
  if (!connected) return "disconnected";
  if (account && account.status === "reauth_required") return "reauth_required";
  return "connected";
}

export const CONNECTION_LABELS = {
  loading: "Verificando…",
  not_configured: "Indisponível",
  disconnected: "Desconectado",
  connecting: "Conectando…",
  connected: "Conectado",
  reauth_required: "Reconexão necessária",
  error: "Erro",
};

// ---- Normalização das respostas ----------------------------------------------

function str(v, max = 300) {
  return typeof v === "string" ? cleanText(v, max).trim() : "";
}

export function normalizeAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    igUserId: str(String(raw.ig_user_id ?? ""), 64),
    username: str(raw.username, 100),
    name: str(raw.name, 150),
    accountType: str(raw.account_type, 40),
    pictureUrl: safeHttpsUrl(raw.profile_picture_url),
    followers: toNum(raw.followers_count),
    follows: toNum(raw.follows_count),
    mediaCount: toNum(raw.media_count),
    status: raw.status === "reauth_required" ? "reauth_required" : "active",
    scopes: Array.isArray(raw.scopes) ? raw.scopes.filter((s) => typeof s === "string") : [],
    connectedAt: str(raw.connected_at, 40),
    tokenExpiresAt: str(raw.token_expires_at, 40),
    profileSyncedAt: str(raw.profile_synced_at, 40),
    mediaSyncedAt: str(raw.media_synced_at, 40),
    rateLimitedUntil: str(raw.rate_limited_until, 40),
  };
}

export function normalizeStatus(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return { configured: d.configured !== false, connected: !!d.connected, account: normalizeAccount(d.account) };
}

export function normalizePost(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const ins = p.insights && typeof p.insights === "object" ? p.insights : null;
  return {
    id: str(String(p.media_id ?? ""), 64),
    caption: truncateCaption(p.caption),
    type: p.media_product_type === "REELS" ? "REELS" : (p.media_type || "OTHER"),
    permalink: safeHttpsUrl(p.permalink),
    thumbnail: safeHttpsUrl(p.thumbnail_url),
    postedAt: str(p.posted_at, 40),
    likes: toNum(p.like_count),
    comments: toNum(p.comments_count),
    insights: ins
      ? { reach: toNum(ins.reach), views: toNum(ins.views), saved: toNum(ins.saved), shares: toNum(ins.shares), interactions: toNum(ins.total_interactions) }
      : null,
    engagementRate: toNum(p.engagement_rate),
    engagementBasis: p.engagement_basis === "reach" || p.engagement_basis === "followers" ? p.engagement_basis : null,
  };
}

export function normalizeEngagement(raw) {
  const e = raw && typeof raw === "object" ? raw : {};
  return {
    postsConsidered: toNum(e.posts_considered) ?? 0,
    interactions: toNum(e.interactions) ?? 0,
    avgInteractions: toNum(e.avg_interactions),
    rate: toNum(e.engagement_rate),
    basis: e.engagement_basis === "reach" || e.engagement_basis === "followers" ? e.engagement_basis : null,
  };
}

export function normalizeOverview(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    account: normalizeAccount(d.account),
    engagement: normalizeEngagement(d.engagement),
    stale: d.stale === true,
    premium: d.premium === true,
  };
}

export function normalizePosts(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(d.items) ? d.items.map(normalizePost).filter((p) => p.id) : [];
  return {
    items,
    nextBefore: typeof d.next_before === "string" && d.next_before ? d.next_before : "",
    limitTotal: toNum(d.limit_total),
    stale: d.stale === true,
  };
}

// Insights: o core devolve na conta views/reach/accounts_engaged/total_interactions/profile_links_taps (28 dias);
// "impressões" foi descontinuada pela Meta e substituída por "visualizações" (views).
export function normalizeInsights(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const a = d.account_insights && typeof d.account_insights === "object" ? d.account_insights : null;
  const posts = Array.isArray(d.posts) ? d.posts.map(normalizePost).filter((p) => p.id) : [];
  const sum = (field) => {
    const vals = posts.map((p) => p.insights && p.insights[field]).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((x, y) => x + y, 0) : null;
  };
  const cmp = d.comparison && typeof d.comparison === "object" ? d.comparison : {};
  const byId = new Map(posts.map((p) => [p.id, p]));
  const pick = (ids) => (Array.isArray(ids) ? ids.map((id) => byId.get(id)).filter(Boolean) : []);
  return {
    periodDays: a ? toNum(a.period_days) || 28 : null,
    account: a
      ? {
        reach: toNum(a.reach), views: toNum(a.views), engaged: toNum(a.accounts_engaged),
        interactions: toNum(a.total_interactions), linkTaps: toNum(a.profile_links_taps),
      }
      : null,
    // Somas dos últimos posts (a conta não expõe salvamentos/compartilhamentos totais).
    postTotals: { saved: sum("saved"), shares: sum("shares"), reach: sum("reach"), views: sum("views") },
    posts,
    engagement: normalizeEngagement(d.engagement),
    top: pick(cmp.top),
    bottom: pick(cmp.bottom),
    byType: Array.isArray(cmp.by_type)
      ? cmp.by_type.map((t) => ({ type: String(t.type || "OTHER"), posts: toNum(t.posts_considered) ?? 0, avg: toNum(t.avg_interactions), rate: toNum(t.engagement_rate) }))
      : [],
    history: Array.isArray(d.history) ? d.history.filter((h) => h && typeof h === "object") : [],
    stale: d.stale === true,
  };
}

// Cartões de insights (rótulo, valor e dica). Visitas ao perfil não são fornecidas pelo core (gap registrado).
export function insightCards(insights) {
  if (!insights) return [];
  const a = insights.account || {};
  const t = insights.postTotals || {};
  return [
    { key: "reach", label: "Alcance", value: a.reach, hint: `contas alcançadas, últimos ${insights.periodDays || 28} dias` },
    { key: "views", label: "Visualizações", value: a.views, hint: "substitui as antigas impressões" },
    { key: "saved", label: "Salvamentos", value: t.saved, hint: "soma dos posts recentes" },
    { key: "shares", label: "Compartilhamentos", value: t.shares, hint: "soma dos posts recentes" },
    { key: "link_taps", label: "Cliques nos links do perfil", value: a.linkTaps, hint: `últimos ${insights.periodDays || 28} dias` },
    { key: "engaged", label: "Contas engajadas", value: a.engaged, hint: `últimos ${insights.periodDays || 28} dias` },
  ];
}

// Séries disponíveis no gráfico do histórico.
export const HISTORY_METRICS = [
  { key: "followers_count", label: "Seguidores" },
  { key: "reach", label: "Alcance" },
  { key: "views", label: "Visualizações" },
  { key: "total_interactions", label: "Interações" },
  { key: "profile_links_taps", label: "Cliques nos links" },
];

// ---- Conversão ----------------------------------------------------------------

export function normalizeConversion(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const t = d.totals && typeof d.totals === "object" ? d.totals : {};
  return {
    period: d.period && typeof d.period === "object" ? { from: str(d.period.from, 20), to: str(d.period.to, 20) } : null,
    totals: {
      taps: toNum(t.profile_links_taps),
      visits: toNum(t.visits) ?? 0,
      bookings: toNum(t.bookings) ?? 0,
      visitToBooking: toNum(t.visit_to_booking_rate),
      revenueEstimatedCents: toNum(t.revenue_estimated_cents) ?? 0,
      revenuePaidCents: toNum(t.revenue_paid_cents) ?? 0,
    },
    byCampaign: Array.isArray(d.by_campaign)
      ? d.by_campaign.map((c) => ({
        campaign: str(c.utm_campaign, 80) || "(sem campanha)",
        visits: toNum(c.visits) ?? 0,
        bookings: toNum(c.bookings) ?? 0,
        revenueEstimatedCents: toNum(c.revenue_estimated_cents) ?? 0,
      }))
      : [],
  };
}

// Etapas do funil: cliques no link do perfil (quando houver) -> visitas à página -> agendamentos -> receita.
// `pct` é a largura da barra (relativa à maior etapa de contagem) e `rate` a conversão da etapa anterior.
export function funnelSteps(totals) {
  if (!totals) return [];
  const steps = [];
  if (totals.taps !== null && totals.taps !== undefined) steps.push({ key: "taps", label: "Cliques no link do perfil", value: totals.taps });
  steps.push({ key: "visits", label: "Visitas à página de agendamento", value: totals.visits });
  steps.push({ key: "bookings", label: "Agendamentos", value: totals.bookings });
  const max = Math.max(1, ...steps.map((s) => s.value));
  return steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].value : null;
    return {
      ...s,
      pct: Math.max(s.value > 0 ? 4 : 0, Math.round((s.value / max) * 100)),
      rate: prev && prev > 0 ? s.value / prev : null,
    };
  });
}

// Visitas só contam quando a página pública recebe UTM; sem nenhuma visita, o painel explica como começar.
export function conversionIsEmpty(conv) {
  if (!conv) return true;
  const t = conv.totals;
  return !t.visits && !t.bookings && !t.revenueEstimatedCents && !t.revenuePaidCents;
}

// Período em dias (para o seletor): últimos N dias até hoje (data local do navegador).
export function periodRange(days, now = Date.now()) {
  const end = new Date(now);
  const start = new Date(now - (days - 1) * 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(start), to: fmt(end) };
}

// ---- Links UTM ----------------------------------------------------------------

export const UTM_PLACEMENTS = [
  { value: "bio", label: "Bio do perfil", premium: false, hint: "Link fixo para a bio (disponível em todos os planos)." },
  { value: "post", label: "Post", premium: true, hint: "Um link por publicação, para medir qual post traz agendamentos." },
  { value: "story", label: "Story", premium: true, hint: "Link para o adesivo de link do story." },
  { value: "campaign", label: "Campanha", premium: true, hint: "Link para anúncios e ações pontuais." },
];

// Mesma regra do core: minúsculas, [a-z0-9_.-]. Espaços viram "-".
export function sanitizeUtmToken(value, max = 80) {
  const text = typeof value === "string" ? value.normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
  return text.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9_.-]/g, "").slice(0, max);
}

// Monta o corpo de POST /utm-link. premium: plano atual (evita a chamada que o core responderia com 402).
// Retorna { ok: true, payload } ou { ok: false, errors: { campo: mensagem }, locked? }.
export function buildUtmPayload(form, { premium = false } = {}) {
  const f = form && typeof form === "object" ? form : {};
  const placement = UTM_PLACEMENTS.some((p) => p.value === f.placement) ? f.placement : "";
  const errors = {};
  if (!placement) errors.placement = "Escolha onde o link será usado.";
  const campaign = sanitizeUtmToken(f.campaign, 80);
  const content = sanitizeUtmToken(f.content, 80);
  const label = typeof f.label === "string" ? cleanText(f.label, 120).trim() : "";
  if (placement === "campaign" && !campaign) errors.campaign = "Informe o nome da campanha (letras, números, - e _).";
  if (placement === "post" && !content) errors.content = "Identifique o post (ex.: promo-novembro).";
  if (placement === "story" && !content) errors.content = "Identifique o story (ex.: story-segunda).";
  if (Object.keys(errors).length) return { ok: false, errors };
  const meta = UTM_PLACEMENTS.find((p) => p.value === placement);
  if (meta.premium && !premium) return { ok: false, locked: true, errors: { placement: "Links por post, story e campanha são do plano Premium." } };
  const payload = { placement };
  if (placement !== "bio") {
    if (campaign) payload.campaign = campaign;
    if (content) payload.content = content;
  }
  if (label) payload.label = label;
  return { ok: true, payload };
}

export function normalizeUtmLink(raw) {
  const l = raw && typeof raw === "object" ? raw : {};
  return {
    id: toNum(l.id),
    label: str(l.label, 120),
    source: str(l.utm_source, 40),
    medium: str(l.utm_medium, 40),
    campaign: str(l.utm_campaign, 80),
    content: str(l.utm_content, 80),
    url: safeHttpsUrl(l.url, { allowLocalHttp: true }),
    createdAt: str(l.created_at, 40),
    pageReady: l.public_page_ready !== false && !!safeHttpsUrl(l.url, { allowLocalHttp: true }),
  };
}

export function utmLinkTitle(link) {
  if (link.label) return link.label;
  if (link.medium === "bio") return "Bio do perfil";
  const parts = [link.medium, link.campaign, link.content].filter(Boolean);
  return parts.join(" · ") || "Link";
}

// Restringe a lista de blocos que dependem do Premium (para o CTA).
export const PREMIUM_BLOCKS = ["insights", "history", "conversion", "comparison", "utm_extra"];
