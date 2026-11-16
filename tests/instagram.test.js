import { describe, it, expect } from "vitest";
import {
  formatCount, formatRate, truncateCaption, mediaTypeLabel, connectionState, normalizeAccount, normalizeStatus, normalizePost,
  normalizeOverview, normalizePosts, normalizeInsights, insightCards, normalizeConversion, funnelSteps, conversionIsEmpty,
  periodRange, sanitizeUtmToken, buildUtmPayload, normalizeUtmLink, utmLinkTitle, ENGAGEMENT_FORMULA,
} from "../utils/instagram.js";

describe("formatação", () => {
  it("formatCount", () => {
    expect(formatCount(950)).toBe("950");
    expect(formatCount(1234)).toBe("1.234");
    expect(formatCount(25400)).toBe("25,4 mil");
    expect(formatCount(2_500_000)).toBe("2,5 mi");
    expect(formatCount(null)).toBe("—");
    expect(formatCount("abc")).toBe("—");
    expect(formatCount(0)).toBe("0");
  });
  it("formatRate", () => {
    expect(formatRate(0.0532)).toBe("5,32%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(null)).toBe("—");
  });
  it("truncateCaption: texto puro, sem controles, com reticências", () => {
    expect(truncateCaption("")).toBe("");
    expect(truncateCaption(null)).toBe("");
    expect(truncateCaption("Olá‮mundo\n\nlinha")).toBe("Olámundo linha");
    const long = truncateCaption("a".repeat(300), 50);
    expect(long.length).toBe(50);
    expect(long.endsWith("…")).toBe(true);
    // HTML não é interpretado: continua como texto.
    expect(truncateCaption("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
  it("mediaTypeLabel e fórmula explicada", () => {
    expect(mediaTypeLabel("REELS")).toBe("Reels");
    expect(mediaTypeLabel("CAROUSEL_ALBUM")).toBe("Carrossel");
    expect(mediaTypeLabel("???")).toBe("Outro");
    expect(ENGAGEMENT_FORMULA).toContain("alcance");
    expect(ENGAGEMENT_FORMULA).toContain("seguidores");
  });
});

describe("connectionState", () => {
  it("cobre os cinco estados da tela", () => {
    expect(connectionState({ loaded: false })).toBe("loading");
    expect(connectionState({ loaded: true, configured: false })).toBe("not_configured");
    expect(connectionState({ loaded: true, configured: true, connected: false })).toBe("disconnected");
    expect(connectionState({ loaded: true, configured: true, connected: false, connecting: true })).toBe("connecting");
    expect(connectionState({ loaded: true, configured: true, connected: true, account: { status: "active" } })).toBe("connected");
    expect(connectionState({ loaded: true, configured: true, connected: true, account: { status: "reauth_required" } })).toBe("reauth_required");
    expect(connectionState({ loaded: true, configured: true, connected: false, error: true })).toBe("error");
  });
  it("erro de bloco não esconde uma conta já conectada", () => {
    expect(connectionState({ loaded: true, configured: true, connected: true, account: { status: "active" }, error: true })).toBe("connected");
  });
});

describe("normalização", () => {
  it("conta: só https nas fotos e nunca expõe token", () => {
    const a = normalizeAccount({ ig_user_id: 1, username: "studio", profile_picture_url: "javascript:alert(1)", followers_count: "1200", status: "reauth_required", access_token: "SEGREDO" });
    expect(a.pictureUrl).toBe("");
    expect(a.followers).toBe(1200);
    expect(a.status).toBe("reauth_required");
    expect(JSON.stringify(a)).not.toContain("SEGREDO");
    expect(normalizeAccount(null)).toBeNull();
  });
  it("status", () => {
    expect(normalizeStatus({ configured: false, connected: false, account: null })).toEqual({ configured: false, connected: false, account: null });
    expect(normalizeStatus(undefined).configured).toBe(true);
  });
  it("post: links e miniaturas inseguros são descartados", () => {
    const p = normalizePost({ media_id: "1", caption: "Oi", media_type: "IMAGE", media_product_type: "REELS", permalink: "http://x.com", thumbnail_url: "https://cdn.x/a.jpg", like_count: 3, comments_count: 1, insights: { reach: 10, saved: 2 } });
    expect(p.type).toBe("REELS");
    expect(p.permalink).toBe("");
    expect(p.thumbnail).toBe("https://cdn.x/a.jpg");
    expect(p.insights).toMatchObject({ reach: 10, saved: 2, shares: null });
    expect(normalizePost({ media_id: "2" }).insights).toBeNull();
  });
  it("overview, posts e paginação", () => {
    const o = normalizeOverview({ account: { username: "a" }, engagement: { engagement_rate: 0.05, engagement_basis: "reach", posts_considered: 3 }, stale: true, premium: false });
    expect(o).toMatchObject({ stale: true, premium: false });
    expect(o.engagement).toMatchObject({ rate: 0.05, basis: "reach", postsConsidered: 3 });
    const posts = normalizePosts({ items: [{ media_id: "1" }, { caption: "sem id" }], next_before: "1", limit_total: 6, stale: false });
    expect(posts.items).toHaveLength(1);
    expect(posts).toMatchObject({ nextBefore: "1", limitTotal: 6 });
    expect(normalizePosts(null).items).toEqual([]);
  });
  it("insights: somas dos posts e comparativo por ids", () => {
    const i = normalizeInsights({
      account_insights: { period_days: 28, reach: 900, views: 2000, accounts_engaged: 50, total_interactions: 120, profile_links_taps: 14 },
      posts: [
        { media_id: "1", insights: { saved: 3, shares: 1, reach: 100 } },
        { media_id: "2", insights: { saved: 2, shares: null, reach: 50 } },
        { media_id: "3" },
      ],
      comparison: { top: ["2", "9"], bottom: ["1"], by_type: [{ type: "REELS", posts_considered: 2, avg_interactions: 10.5, engagement_rate: 0.04 }] },
      history: [{ snapshot_date: "2026-11-05", reach: 1 }, null],
    });
    expect(i.postTotals).toMatchObject({ saved: 5, shares: 1, reach: 150 });
    expect(i.top.map((p) => p.id)).toEqual(["2"]);
    expect(i.byType[0]).toMatchObject({ type: "REELS", posts: 2, rate: 0.04 });
    expect(i.history).toHaveLength(1);
    const cards = insightCards(i);
    expect(cards.map((c) => c.key)).toEqual(["reach", "views", "saved", "shares", "link_taps", "engaged"]);
    expect(cards.find((c) => c.key === "reach").value).toBe(900);
    expect(insightCards(null)).toEqual([]);
  });
  it("insights sem dados da conta mantém o resto", () => {
    const i = normalizeInsights({ account_insights: null, posts: [], history: [] });
    expect(i.account).toBeNull();
    expect(i.postTotals.saved).toBeNull();
  });
});

describe("conversão e funil", () => {
  const conv = normalizeConversion({
    period: { from: "2026-10-18", to: "2026-11-16" },
    totals: { profile_links_taps: 40, visits: 20, bookings: 5, visit_to_booking_rate: 0.25, revenue_estimated_cents: 50000, revenue_paid_cents: 20000 },
    by_campaign: [{ utm_campaign: "perfil", visits: 15, bookings: 4, revenue_estimated_cents: 40000 }, { utm_campaign: "", visits: 5, bookings: 1, revenue_estimated_cents: 10000 }],
  });
  it("normaliza totais e campanhas", () => {
    expect(conv.totals).toMatchObject({ taps: 40, visits: 20, bookings: 5, visitToBooking: 0.25, revenueEstimatedCents: 50000, revenuePaidCents: 20000 });
    expect(conv.byCampaign[1].campaign).toBe("(sem campanha)");
  });
  it("funil: etapas, largura relativa e taxa da etapa anterior", () => {
    const steps = funnelSteps(conv.totals);
    expect(steps.map((s) => s.key)).toEqual(["taps", "visits", "bookings"]);
    expect(steps[0].pct).toBe(100);
    expect(steps[1].rate).toBe(0.5);
    expect(steps[2].rate).toBe(0.25);
  });
  it("sem snapshot de cliques, o funil começa nas visitas", () => {
    const steps = funnelSteps({ ...conv.totals, taps: null });
    expect(steps.map((s) => s.key)).toEqual(["visits", "bookings"]);
    expect(steps[0].rate).toBeNull();
  });
  it("etapa zerada não quebra a divisão", () => {
    const steps = funnelSteps({ taps: null, visits: 0, bookings: 0 });
    expect(steps.every((s) => s.pct === 0 && s.rate === null)).toBe(true);
  });
  it("conversionIsEmpty", () => {
    expect(conversionIsEmpty(null)).toBe(true);
    expect(conversionIsEmpty(normalizeConversion({ totals: {} }))).toBe(true);
    expect(conversionIsEmpty(conv)).toBe(false);
  });
  it("periodRange devolve datas locais ISO", () => {
    const r = periodRange(30, new Date(2026, 10, 16, 12).getTime());
    expect(r).toEqual({ from: "2026-10-18", to: "2026-11-16" });
  });
});

describe("links UTM", () => {
  it("sanitizeUtmToken segue a regra do core", () => {
    expect(sanitizeUtmToken("Promo Dia das Mães!")).toBe("promo-dia-das-maes");
    expect(sanitizeUtmToken("A_b.c-D")).toBe("a_b.c-d");
    expect(sanitizeUtmToken("x".repeat(200), 80)).toHaveLength(80);
    expect(sanitizeUtmToken(null)).toBe("");
  });
  it("bio é liberada no Free e não envia campanha nem conteúdo", () => {
    const r = buildUtmPayload({ placement: "bio", campaign: "x", content: "y", label: " Meu link " }, { premium: false });
    expect(r).toEqual({ ok: true, payload: { placement: "bio", label: "Meu link" } });
  });
  it("post/story/campanha no Free: bloqueia antes da chamada (locked)", () => {
    const r = buildUtmPayload({ placement: "post", content: "promo" }, { premium: false });
    expect(r).toMatchObject({ ok: false, locked: true });
  });
  it("Premium: valida e normaliza os campos obrigatórios", () => {
    expect(buildUtmPayload({ placement: "campaign", campaign: "" }, { premium: true }).errors.campaign).toBeTruthy();
    expect(buildUtmPayload({ placement: "post", content: "" }, { premium: true }).errors.content).toBeTruthy();
    expect(buildUtmPayload({ placement: "story", content: "Segunda Feira" }, { premium: true }))
      .toEqual({ ok: true, payload: { placement: "story", content: "segunda-feira" } });
    expect(buildUtmPayload({ placement: "campaign", campaign: "Black Friday" }, { premium: true }).payload)
      .toEqual({ placement: "campaign", campaign: "black-friday" });
    expect(buildUtmPayload({ placement: "x" }, { premium: true }).errors.placement).toBeTruthy();
    expect(buildUtmPayload(null).ok).toBe(false);
  });
  it("normalizeUtmLink: url insegura some, título cai para o meio", () => {
    const l = normalizeUtmLink({ id: 3, utm_source: "instagram", utm_medium: "bio", utm_campaign: "perfil", url: "javascript:x", public_page_ready: true });
    expect(l.url).toBe("");
    expect(l.pageReady).toBe(false);
    expect(utmLinkTitle(l)).toBe("Bio do perfil");
    const post = normalizeUtmLink({ id: 4, utm_medium: "post", utm_campaign: "instagram", utm_content: "promo", url: "https://app.test/b/x?utm_source=instagram", label: "" });
    expect(utmLinkTitle(post)).toBe("post · instagram · promo");
    expect(post.pageReady).toBe(true);
    expect(utmLinkTitle({ ...post, label: "Meu" })).toBe("Meu");
  });
});
