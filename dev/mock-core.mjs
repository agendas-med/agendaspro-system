// SOMENTE DESENVOLVIMENTO. Core falso para testar visualmente as telas do assistente sem o core real.
// Não é importado pelo app nem entra no build (fica fora de pages/, plugins/, components/ e utils/).
// Reflete o contrato do core após o follow-up 1 (A1-A9): status, source/degraded, KB ativo + PATCH, reemissão de token,
// erros com código, DELETE de conversa, ids de mensagem e created_at em UTC real com "Z".
//
// Uso:  node dev/mock-core.mjs            (porta 3001 = NUXT_PUBLIC_API_BASE padrão do `nuxt dev`)
//   MOCK_PORT=3001   porta
//   MOCK_ROLE=admin  admin (permission 1) | member (outro valor)
//   MOCK_PLAN=free   free (somente consulta, cota 30) | premium (cota 1000)
//   MOCK_DISABLED=1  assistente desligado (status enabled:false; demais rotas 503 assistant_disabled)
//   MOCK_KB_LIMIT=3  limite de textos da base (409 knowledge_limit_reached ao passar; padrão 500)
//
// Palavras-chave para disparar cenários no chat:
//   "agendar"  -> resposta com ação proposta (confirm_token)      "limite"  -> 402 cota esgotada
//   "devagar"  -> 429 com Retry-After                             "caiu"    -> grava a resposta mas devolve 502 (recuperação)
//   "link"     -> resposta com links/HTML perigosos               "orcamento" -> 429 assistant_budget_exceeded
//   "premium"  -> 402 de recurso (feature), sem gravar a pergunta nem gastar cota (A7)
//   "desligar" -> 503 actions_disabled, sem gravar a pergunta nem gastar cota (A7)
//   "degradar" -> resposta source=fallback (degraded)             "semia"   -> resposta source=template, degraded=true
//
// F6 (integrações): MOCK_IG e MOCK_GCAL = disconnected (padrão) | connected | reauth | notconfigured (503) | off (404, core sem F6).
//   Rotas /integrations/instagram/* e /integrations/google-calendar/*, /professionals, GET /time-blocks e /mock/authorize/*.
//   Free: 402 em insights/conversão/links não-bio e na conexão do Google. "sync" responde 429 após 6 chamadas.
//   MOCK_ROLE=member: 403 admin_required nas ações de admin. Para simular o usuário recusando no provedor, acrescente &deny=1 à URL.
// Não tem segredos nem acesso a nada: tudo em memória.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 3001);
const ROLE = process.env.MOCK_ROLE || 'admin';
const PLAN = process.env.MOCK_PLAN || 'premium';
const DISABLED = process.env.MOCK_DISABLED === '1';
const KB_LIMIT = Number(process.env.MOCK_KB_LIMIT || 500);
const MONTHLY_LIMIT = PLAN === 'free' ? 30 : 1000;

const conversations = new Map();
const actions = new Map();
const nowIso = () => new Date().toISOString(); // core: UTC real, com "Z" (A6)
const knowledge = [
  { id: 1, kind: 'faq', title: 'Horário de funcionamento', content: 'Abrimos de segunda a sábado, das 9h às 18h.', active: true, updated_at: nowIso() },
  { id: 2, kind: 'policy', title: 'Cancelamento', content: 'Cancelamentos com menos de 2 horas de antecedência podem ser cobrados.', active: true, updated_at: nowIso() },
];
let nextKnowledge = 3;
let used = 7;
let seq = 1;
let msgSeq = 100;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const coded = (res, status, code, message, extra = {}, headers = {}) => send(res, status, { error: { code, message, ...extra } }, headers);
const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

const view = (c) => ({ id: c.id, title: c.title, message_count: c.messages.length, created_at: c.created_at, updated_at: c.updated_at });
const addMessage = (c, role, content, source) => {
  const m = { id: msgSeq++, role, content, source, created_at: nowIso() };
  c.messages.push(m);
  return m;
};

function statusBody() {
  const admin = ROLE === 'admin';
  const actionsOn = PLAN !== 'free';
  return {
    enabled: !DISABLED,
    role: admin ? 'admin' : 'member',
    plan: { code: PLAN, name: PLAN === 'free' ? 'Free' : 'Premium' },
    usage: { interactions_used: used, interactions_limit: MONTHLY_LIMIT, period: nowIso().slice(0, 7) },
    ai_available: true,
    rag_enabled: true,
    actions: actionsOn ? { enabled: true, reason: null, tools: ['create_appointment'] } : { enabled: false, reason: 'plan', tools: [] },
    read_tools: ['list_appointments', 'list_services'],
    knowledge_admin: admin,
  };
}

function newReply(c, text) {
  const t = text.toLowerCase();
  const reply = { text: 'Claro! Posso ajudar com isso.', citations: [{ source_type: 'knowledge', source_id: '1', score: 0.82 }, { source_type: 'service', source_id: '3', score: 0.6 }], action: null, source: 'ai', degraded: false };
  if (t.includes('link')) {
    reply.text = 'Veja **nosso site** em https://agendaspro.com.br/ajuda e [o painel](/billing/plano).\n- [clique aqui](javascript:alert(1))\n- [outro](https://evil.example.com/x)\n<script>alert(1)</script> <img src=x onerror=alert(1)>\nmailto:contato@agendaspro.com.br';
  } else if (t.includes('agendar')) {
    reply.text = 'Posso criar este agendamento para você. Confira o resumo abaixo e confirme se estiver correto.';
    const id = 'act_' + seq++;
    const token = 'tok_' + Math.random().toString(36).slice(2);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    actions.set(id, { id, token, state: 'pending', conversation: c.id, expiresAt, tool: 'create_appointment' });
    reply.action = {
      action_id: id, tool: 'create_appointment', risk: 'medium', summary: 'Agendar Corte de cabelo para Maria Souza amanhã às 14h com a Joana.',
      params_preview: { customer_name: 'Maria Souza', service_name: 'Corte de cabelo', professional_name: 'Joana', start: 'Amanhã, 14:00', company_id: 1, confirm_token: 'nao-mostrar' },
      expires_at: expiresAt, confirm_token: token,
    };
  } else if (t.includes('markdown')) {
    reply.text = 'Você tem **3 agendamentos** hoje:\n- 09:00 Maria\n- 11:00 João\n- 15:30 Ana\n\nQuer que eu liste os de amanhã?';
  } else if (t.includes('degradar')) {
    reply.text = 'Resposta simplificada: não consegui consultar a IA agora.';
    reply.source = 'fallback';
    reply.degraded = true;
  } else if (t.includes('semia')) {
    reply.text = 'Resposta pronta do sistema (sem IA).';
    reply.source = 'template';
    reply.degraded = true;
  }
  return reply;
}

function validateKnowledge(body, { partial }) {
  const fields = [];
  const kinds = ['faq', 'policy', 'rule', 'template'];
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('kind')) if (!kinds.includes(body.kind)) fields.push({ field: 'kind', message: 'Tipo inválido.' });
  if (!partial || has('title')) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) fields.push({ field: 'title', message: 'O título é obrigatório.' });
    else if (title.length > 160) fields.push({ field: 'title', message: 'O título pode ter até 160 caracteres.' });
  }
  if (!partial || has('content')) {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) fields.push({ field: 'content', message: 'O conteúdo é obrigatório.' });
  }
  if (has('active') && typeof body.active !== 'boolean') fields.push({ field: 'active', message: 'Ativo deve ser verdadeiro ou falso.' });
  if (partial && !Object.keys(body).length) fields.push({ field: 'body', message: 'Envie ao menos um campo.' });
  return fields;
}

const validationError = (res, fields) => send(res, 400, { error: { code: 'validation_error', message: 'Dados inválidos.', fields }, errors: fields });

async function handleAssistant(req, res, url, body) {
  const path = url.pathname;
  const method = req.method;

  // A1: o status responde mesmo com o assistente desligado (enabled:false), antes de qualquer outra barreira.
  if (path === '/assistant/status' && method === 'GET') return send(res, 200, { data: statusBody() });
  if (DISABLED) return coded(res, 503, 'assistant_disabled', 'Assistente desligado.');

  if (path === '/assistant/conversations' && method === 'GET') {
    return send(res, 200, { data: [...conversations.values()].map(view) });
  }
  if (path === '/assistant/conversations' && method === 'POST') {
    const id = 'c' + seq++;
    const c = { id, title: '', messages: [], created_at: nowIso(), updated_at: nowIso() };
    conversations.set(id, c);
    return send(res, 201, { data: view(c) });
  }
  let m = path.match(/^\/assistant\/conversations\/([^/]+)$/);
  if (m && method === 'GET') {
    const c = conversations.get(m[1]);
    if (!c) return coded(res, 404, 'conversation_not_found', 'Conversa não encontrada.');
    const pending = [...actions.values()].filter((a) => a.conversation === c.id && a.state === 'pending' && new Date(a.expiresAt) > new Date()).map((a) => ({
      action_id: a.id, tool: a.tool, risk: 'medium', summary: 'Agendar Corte de cabelo para Maria Souza amanhã às 14h com a Joana.', expires_at: a.expiresAt,
    }));
    return send(res, 200, { data: { ...view(c), messages: c.messages, pending_actions: pending } });
  }
  // A8: apagar a conversa também expira as ações pendentes dela.
  if (m && method === 'DELETE') {
    const c = conversations.get(m[1]);
    if (!c) return coded(res, 404, 'conversation_not_found', 'Conversa não encontrada.');
    for (const a of actions.values()) if (a.conversation === c.id && a.state === 'pending') a.state = 'expired';
    conversations.delete(c.id);
    return send(res, 200, { data: { deleted: true } });
  }
  m = path.match(/^\/assistant\/conversations\/([^/]+)\/messages$/);
  if (m && method === 'POST') {
    const c = conversations.get(m[1]);
    if (!c) return coded(res, 404, 'conversation_not_found', 'Conversa não encontrada.');
    const text = String(body.message || '');
    const t = text.toLowerCase();
    if (t.includes('limite')) return coded(res, 402, 'plan_upgrade_required', 'Você usou todas as interações do mês.', { plan: PLAN, quota: 'assistant_monthly_interactions', limit: MONTHLY_LIMIT, used: MONTHLY_LIMIT });
    if (t.includes('devagar')) return coded(res, 429, 'rate_limited', 'Calma.', { retry_after: 8 }, { 'Retry-After': '8' });
    if (t.includes('orcamento')) return coded(res, 429, 'assistant_budget_exceeded', 'Orçamento de IA esgotado.');
    // A7: proposta negada não grava a pergunta nem consome cota.
    if (t.includes('premium')) return coded(res, 402, 'plan_upgrade_required', 'Ações pelo assistente exigem o plano Premium.', { plan: 'free', feature: 'assistant_actions' });
    if (t.includes('desligar')) return coded(res, 503, 'assistant_actions_disabled', 'Ações desativadas.');
    const userMsg = addMessage(c, 'user', text, 'user');
    if (!c.title) c.title = text.slice(0, 40);
    used += 1;
    const r = newReply(c, text);
    const replyMsg = addMessage(c, 'assistant', r.text, r.source);
    c.updated_at = nowIso();
    if (t.includes('caiu')) return send(res, 502, undefined); // gravou, mas a resposta se perde
    await new Promise((r2) => setTimeout(r2, 900));
    return send(res, 200, {
      data: {
        reply: r.text, source: r.source, degraded: r.degraded, user_message_id: userMsg.id, message_id: replyMsg.id,
        citations: r.citations, proposed_actions: r.action ? [r.action] : [], truncated: false,
        usage: { interactions_used: used, interactions_limit: MONTHLY_LIMIT },
      },
    });
  }
  // A4: reemite o token de uma ação pendente. O token antigo deixa de valer; o prazo NÃO é estendido; params_preview vem null.
  m = path.match(/^\/assistant\/actions\/([^/]+)\/token$/);
  if (m && method === 'POST') {
    const a = actions.get(m[1]);
    if (!a) return coded(res, 404, 'action_not_found', 'Ação não encontrada.');
    if (a.state !== 'pending') return coded(res, 409, 'action_already_processed', 'Já processada.');
    if (new Date(a.expiresAt) <= new Date()) return coded(res, 410, 'action_expired', 'Expirada.');
    a.token = 'tok_' + Math.random().toString(36).slice(2);
    return send(res, 200, {
      data: {
        action_id: a.id, tool: a.tool, risk: 'medium', summary: 'Agendar Corte de cabelo para Maria Souza amanhã às 14h com a Joana.',
        params_preview: null, expires_at: a.expiresAt, confirm_token: a.token,
      },
    });
  }
  m = path.match(/^\/assistant\/actions\/([^/]+)\/(confirm|reject)$/);
  if (m && method === 'POST') {
    const a = actions.get(m[1]);
    if (!a) return coded(res, 404, 'action_not_found', 'Ação não encontrada.');
    if (a.state !== 'pending') return coded(res, 409, 'action_already_processed', 'Já processada.');
    if (new Date(a.expiresAt) <= new Date()) return coded(res, 410, 'action_expired', 'Expirada.');
    if (m[2] === 'reject') { a.state = 'rejected'; return send(res, 200, { data: { action_id: a.id, status: 'rejected' } }); }
    if (body.confirm_token !== a.token) return coded(res, 403, 'invalid_confirm_token', 'Token inválido.');
    a.state = 'executed';
    return send(res, 200, { data: { action_id: a.id, status: 'executed', tool: a.tool, summary: 'Agendamento criado para amanhã às 14h.', result: { appointment_id: 981, customer_name: 'Maria Souza' } } });
  }
  if (path.startsWith('/assistant/knowledge')) {
    // A5: quem não é admin recebe 403 admin_required (não derruba a sessão).
    if (ROLE !== 'admin') return coded(res, 403, 'admin_required', 'Apenas administradores gerenciam a base de conhecimento.');
    if (path === '/assistant/knowledge' && method === 'GET') return send(res, 200, { data: knowledge });
    if (path === '/assistant/knowledge' && method === 'POST') {
      const fields = validateKnowledge(body, { partial: false });
      if (fields.length) return validationError(res, fields);
      if (knowledge.length >= KB_LIMIT) return coded(res, 409, 'knowledge_limit_reached', `A base chegou ao limite de ${KB_LIMIT} textos.`, { limit: KB_LIMIT });
      const item = { id: nextKnowledge++, kind: body.kind, title: body.title.trim(), content: body.content.trim(), active: body.active !== false, updated_at: nowIso() };
      knowledge.push(item);
      return send(res, 201, { data: item });
    }
    m = path.match(/^\/assistant\/knowledge\/(\d+)$/);
    const idx = m ? knowledge.findIndex((k) => k.id === Number(m[1])) : -1;
    if (m && idx < 0) return coded(res, 404, 'knowledge_not_found', 'Texto não encontrado.');
    if (m && (method === 'PATCH' || method === 'PUT')) {
      const fields = validateKnowledge(body, { partial: method === 'PATCH' });
      if (fields.length) return validationError(res, fields);
      const cur = knowledge[idx];
      knowledge[idx] = {
        ...cur,
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content.trim() } : {}),
        ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
        updated_at: nowIso(),
      };
      return send(res, 200, { data: knowledge[idx] });
    }
    if (m && method === 'DELETE') { knowledge.splice(idx, 1); return send(res, 200, { data: { ok: true } }); }
  }
  return send(res, 404, { message: 'rota do mock não implementada' });
}

// ---- Integrações (F6): Instagram e Google Agenda -----------------------------------------------------------
// MOCK_IG / MOCK_GCAL: disconnected (padrão) | connected | reauth | notconfigured | off (404, como um core sem a F6)
//   MOCK_ROLE=member  -> ações de admin respondem 403 admin_required     MOCK_PLAN=free -> 402 nos recursos Premium
// O "login" do provedor é simulado: GET /mock/authorize/<provider>?redirect_uri&state devolve 302 para a redirect_uri
// (somente http://localhost) com ?code&state. "?deny=1" simula o usuário recusando.
const IG_MODE = process.env.MOCK_IG || 'disconnected';
const GC_MODE = process.env.MOCK_GCAL || 'disconnected';
const premium = PLAN !== 'free';
const isAdmin = ROLE === 'admin';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

const ig = {
  connected: IG_MODE === 'connected' || IG_MODE === 'reauth',
  reauth: IG_MODE === 'reauth',
  state: '',
  links: [{ id: 1, label: 'Bio do perfil', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: '', utm_content: '', url: 'http://localhost:3000/p/studio-teste?utm_source=instagram&utm_medium=bio', created_at: nowIso(), public_page_ready: true }],
  nextLink: 2,
};
const igAccount = () => ({
  ig_user_id: '1784', username: 'studio_teste', name: 'Studio Teste', account_type: 'BUSINESS', profile_picture_url: null,
  followers_count: 12840, follows_count: 312, media_count: 214, status: ig.reauth ? 'reauth_required' : 'active', scopes: ['instagram_business_basic'],
  connected_at: nowIso(), token_expires_at: new Date(Date.now() + 40 * 86400000).toISOString(), profile_synced_at: nowIso(), media_synced_at: nowIso(), rate_limited_until: null,
});
const igPosts = Array.from({ length: 30 }, (_, i) => ({
  media_id: String(9000 + i), caption: i === 2 ? 'Promoção de novembro: <script>alert(1)</script> corte + escova com 20% de desconto para quem agendar pelo link da bio. Vagas limitadas, corre!' : `Post ${i + 1}: resultado do dia no Studio Teste #beleza`,
  media_type: i % 5 === 0 ? 'VIDEO' : i % 3 === 0 ? 'CAROUSEL_ALBUM' : 'IMAGE', media_product_type: i % 5 === 0 ? 'REELS' : 'FEED',
  permalink: `https://www.instagram.com/p/mock${i}/`, thumbnail_url: null, posted_at: new Date(Date.now() - i * 2 * 86400000).toISOString(),
  like_count: 120 - i * 3, comments_count: 14 - (i % 9), engagement_rate: 0.08 - i * 0.002, engagement_basis: 'reach',
  insights: { reach: 2400 - i * 40, views: 3100 - i * 50, saved: 30 - i, shares: 12 - (i % 8), total_interactions: 160 - i * 4 },
}));
const igHistory = Array.from({ length: 30 }, (_, i) => ({
  snapshot_date: day(i - 29), followers_count: 12400 + i * 15, reach: 1800 + ((i * 97) % 600) + i * 20, views: 2500 + ((i * 131) % 700) + i * 25,
  total_interactions: 300 + ((i * 53) % 160), profile_links_taps: i % 6 === 0 ? null : 20 + ((i * 7) % 25),
}));

function handleInstagram(req, res, url, body) {
  const path = url.pathname.replace('/integrations/instagram', '') || '/';
  const method = req.method;
  if (IG_MODE === 'off') return send(res, 404, { message: 'rota do mock não implementada' });
  if (path === '/status') {
    if (IG_MODE === 'notconfigured') return coded(res, 503, 'instagram_not_configured', 'Integração indisponível.');
    return send(res, 200, { data: { configured: true, connected: ig.connected, account: ig.connected ? igAccount() : null } });
  }
  if (path === '/connect/start' && method === 'POST') {
    if (!isAdmin) return coded(res, 403, 'admin_required', 'Apenas administradores podem conectar o Instagram.');
    ig.state = 'igstate_' + Math.random().toString(36).slice(2);
    const q = new URLSearchParams({ redirect_uri: String(body.redirect_uri || ''), state: ig.state });
    return send(res, 200, { data: { authorize_url: `http://localhost:${PORT}/mock/authorize/instagram?${q}`, state: ig.state } });
  }
  if (path === '/callback' && method === 'POST') {
    if (!ig.state || body.state !== ig.state) return coded(res, 400, 'oauth_state_invalid', 'Autorização expirada ou inválida. Tente conectar novamente.');
    ig.state = '';
    ig.connected = true; ig.reauth = false;
    return send(res, 200, { data: { configured: true, connected: true, account: igAccount() } });
  }
  if (!ig.connected) return coded(res, 404, 'instagram_not_connected', 'Instagram não conectado.');
  if (path === '/disconnect' && method === 'POST') {
    if (!isAdmin) return coded(res, 403, 'admin_required', 'Apenas administradores.');
    ig.connected = false; ig.reauth = false;
    return send(res, 200, { data: { disconnected: true } });
  }
  if (ig.reauth && path !== '/utm-links') return coded(res, 409, 'instagram_reauth_required', 'Reconecte o Instagram.');
  if (path === '/overview' || (path === '/refresh' && method === 'POST')) {
    return send(res, 200, { data: { account: igAccount(), engagement: { posts_considered: 12, interactions: 1840, avg_interactions: 153.3, engagement_rate: 0.0532, engagement_basis: 'reach' }, stale: false, premium } });
  }
  if (path === '/posts') {
    const limit = premium ? Number(url.searchParams.get('limit') || 12) : 6;
    const from = Number(url.searchParams.get('before') || 0);
    const items = igPosts.slice(from, from + limit);
    const next = premium && from + limit < igPosts.length ? String(from + limit) : null;
    return send(res, 200, { data: { items, next_before: next, limit_total: premium ? null : 6, stale: false } });
  }
  if (path === '/insights') {
    if (!premium) return coded(res, 402, 'plan_upgrade_required', 'Insights são do plano Premium.', { feature: 'instagram' });
    const days = Number(url.searchParams.get('days') || 30);
    const top = igPosts.slice(0, 3).map((p) => p.media_id);
    return send(res, 200, { data: {
      account_insights: { period_days: 28, reach: 18400, views: 25100, accounts_engaged: 940, total_interactions: 2210, profile_links_taps: 186 },
      posts: igPosts.slice(0, 12), engagement: { posts_considered: 12, interactions: 1840, avg_interactions: 153.3, engagement_rate: 0.0532, engagement_basis: 'reach' },
      comparison: { top, bottom: igPosts.slice(9, 12).map((p) => p.media_id), by_type: [{ type: 'REELS', posts_considered: 3, avg_interactions: 210, engagement_rate: 0.07 }, { type: 'IMAGE', posts_considered: 7, avg_interactions: 120, engagement_rate: 0.04 }] },
      history: igHistory.slice(-Math.min(days, 30)), stale: false } });
  }
  if (path === '/conversion') {
    if (!premium) return coded(res, 402, 'plan_upgrade_required', 'Conversão é do plano Premium.', { feature: 'instagram' });
    return send(res, 200, { data: { period: { from: url.searchParams.get('from'), to: url.searchParams.get('to') }, totals: { profile_links_taps: 186, visits: 142, bookings: 23, visit_to_booking_rate: 0.162, revenue_estimated_cents: 345000, revenue_paid_cents: 180000 },
      by_campaign: [{ utm_campaign: 'promo-novembro', visits: 80, bookings: 15, revenue_estimated_cents: 225000 }, { utm_campaign: '', visits: 62, bookings: 8, revenue_estimated_cents: 120000 }] } });
  }
  if (path === '/utm-links') return send(res, 200, { data: ig.links });
  if (path === '/utm-link' && method === 'POST') {
    if (body.placement !== 'bio' && !premium) return coded(res, 402, 'plan_upgrade_required', 'Links por post, story e campanha são do plano Premium.', { feature: 'instagram' });
    const link = { id: ig.nextLink++, label: body.label || '', utm_source: 'instagram', utm_medium: body.placement, utm_campaign: body.campaign || '', utm_content: body.content || '', created_at: nowIso(), public_page_ready: true,
      url: `http://localhost:3000/p/studio-teste?utm_source=instagram&utm_medium=${body.placement}${body.campaign ? '&utm_campaign=' + body.campaign : ''}${body.content ? '&utm_content=' + body.content : ''}` };
    ig.links.unshift(link);
    return send(res, 201, { data: link });
  }
  return send(res, 404, { message: 'rota do mock não implementada' });
}

const gc = {
  connected: GC_MODE === 'connected' || GC_MODE === 'reauth',
  reauth: GC_MODE === 'reauth',
  state: '',
  syncs: 0,
  links: GC_MODE === 'connected' || GC_MODE === 'reauth' ? [
    { id: 11, role: 'push', professional_id: null, calendar_id: 'app@group.calendar.google.com', calendar_summary: 'AgendasPRO - Studio Teste', created_by_app: true, last_sync_at: nowIso(), last_full_sync_at: nowIso(), push_channel_active: false },
    { id: 12, role: 'busy', professional_id: 1, calendar_id: 'joana@example.test', calendar_summary: 'Joana (pessoal)', created_by_app: false, last_sync_at: nowIso(), last_full_sync_at: nowIso(), push_channel_active: true },
  ] : [],
  nextLink: 20,
};
const gcCalendars = [
  { id: 'joana@example.test', summary: 'Joana (pessoal)', primary: true, access_role: 'owner', time_zone: 'America/Sao_Paulo' },
  { id: 'feriados@group.v.calendar.google.com', summary: 'Feriados no Brasil', primary: false, access_role: 'reader', time_zone: 'America/Sao_Paulo' },
  { id: 'equipe@group.calendar.google.com', summary: 'Equipe', primary: false, access_role: 'writer', time_zone: 'America/Sao_Paulo' },
];
const gcStatus = () => ({
  configured: true, connected: gc.connected, links: gc.connected ? gc.links : [],
  account: gc.connected ? { email: 'joana@example.test', status: gc.reauth ? 'reauth_required' : 'active', scopes: [], connected_at: nowIso(), last_push_at: new Date(Date.now() - 35 * 60000).toISOString(), last_error_code: gc.reauth ? 'google_calendar_reauth_required' : null } : null,
});

function handleGoogle(req, res, url, body) {
  const path = url.pathname.replace('/integrations/google-calendar', '') || '/';
  const method = req.method;
  if (GC_MODE === 'off') return send(res, 404, { message: 'rota do mock não implementada' });
  if (path === '/status') {
    if (GC_MODE === 'notconfigured') return coded(res, 503, 'google_calendar_not_configured', 'Integração indisponível.');
    return send(res, 200, { data: gcStatus() });
  }
  const needAdmin = () => (isAdmin ? null : coded(res, 403, 'admin_required', 'Apenas administradores.'));
  const needPremium = () => (premium ? null : coded(res, 402, 'plan_upgrade_required', 'O Google Agenda é do plano Premium.', { feature: 'google_calendar' }));
  if (path === '/connect/start' && method === 'POST') {
    if (needAdmin()) return; if (needPremium()) return;
    gc.state = 'gcstate_' + Math.random().toString(36).slice(2);
    const q = new URLSearchParams({ redirect_uri: String(body.redirect_uri || ''), state: gc.state });
    return send(res, 200, { data: { authorize_url: `http://localhost:${PORT}/mock/authorize/google-calendar?${q}`, state: gc.state } });
  }
  if (path === '/callback' && method === 'POST') {
    if (!gc.state || body.state !== gc.state) return coded(res, 400, 'oauth_state_invalid', 'Autorização expirada ou inválida. Tente conectar novamente.');
    gc.state = ''; gc.connected = true; gc.reauth = false;
    return send(res, 200, { data: gcStatus() });
  }
  if (path === '/disconnect' && method === 'POST') {
    if (needAdmin()) return;
    gc.connected = false; gc.reauth = false; gc.links = [];
    return send(res, 200, { data: { disconnected: true, removed_calendars: body.remove_app_calendars ? 1 : 0 } });
  }
  if (!gc.connected) return coded(res, 404, 'google_calendar_not_connected', 'Google Agenda não conectado.');
  if (path === '/links' && method === 'GET') return send(res, 200, { data: gc.links });
  if (path === '/calendars') {
    if (needAdmin()) return; if (needPremium()) return;
    if (gc.reauth) return coded(res, 409, 'google_calendar_reauth_required', 'Reconecte o Google.');
    return send(res, 200, { data: gcCalendars });
  }
  if (path === '/links' && method === 'POST') {
    if (needAdmin()) return; if (needPremium()) return;
    const link = { id: gc.nextLink++, role: body.role, professional_id: body.professional_id ?? null, calendar_id: body.calendar_id || 'novo-app@group.calendar.google.com',
      calendar_summary: gcCalendars.find((c) => c.id === body.calendar_id)?.summary || 'AgendasPRO - Studio Teste', created_by_app: !!body.create_app_calendar, last_sync_at: null, last_full_sync_at: null, push_channel_active: false };
    gc.links.push(link);
    return send(res, 201, { data: link });
  }
  const m = path.match(/^\/links\/(\d+)$/);
  if (m && method === 'DELETE') {
    if (needAdmin()) return;
    gc.links = gc.links.filter((l) => String(l.id) !== m[1]);
    return send(res, 200, { data: { deleted: true } });
  }
  if (path === '/sync' && method === 'POST') {
    if (needAdmin()) return; if (needPremium()) return;
    gc.syncs += 1;
    if (gc.syncs > 6) return coded(res, 429, 'rate_limited', 'Limite de sincronizações atingido.', { retry_at: new Date(Date.now() + 40 * 60000).toISOString() }, { 'Retry-After': '2400' });
    return send(res, 202, { data: { queued: true } });
  }
  return send(res, 404, { message: 'rota do mock não implementada' });
}

const professionals = [{ id: 1, name: 'Joana', active: true }, { id: 2, name: 'Carlos', active: true }];
const timeBlocks = () => [
  { id: 501, professional_id: 1, starts_at: day(2) + 'T13:00:00', ends_at: day(2) + 'T14:30:00', reason: 'Ocupado (Google Agenda)', source: 'google' },
  { id: 502, professional_id: 1, starts_at: day(4) + 'T09:00:00', ends_at: day(4) + 'T12:00:00', reason: 'Consulta médica', source: 'manual' },
];

// ---- Revisao visual (F1-F6): billing, profissionais, horarios, bloqueios e WhatsApp ----
// MOCK_EMPTY=1 -> listas vazias; MOCK_FAIL=billing,professionals,whatsapp -> 500 nesses grupos;
// MOCK_WA=off (404) | disabled (enabled:false) | exceeded (cota estourada, Free).
const EMPTY = process.env.MOCK_EMPTY === '1';
const FAIL = (process.env.MOCK_FAIL || '').split(',').filter(Boolean);
const WA_MODE = process.env.MOCK_WA || 'on';
const ago = (min) => new Date(Date.now() - min * 60000).toISOString().slice(0, 19);
let pros = EMPTY ? [] : [
  { id: 1, name: 'Joana Martins', email: 'joana@studio.test', phone: '11988887777', color: '#4a90e2', active: true, service_ids: [1, 2], google_connected: true },
  { id: 2, name: 'Carlos Eduardo de Albuquerque Nogueira', email: 'carlos.albuquerque.nogueira@studio-exemplo.test', color: '#7cdf64', active: true, service_ids: [1] },
  { id: 3, name: 'Paula Reis', color: '#ffcc17', active: false, service_ids: [] },
];
let rules = [1, 2, 3, 4, 5].map((d) => ({ weekday: d, start_time: '09:00:00', end_time: '18:00:00' }));
let extraBlocks = [];
let nextPro = 10;
const waConvs = EMPTY ? [] : [
  { id: 1, contact: { wa_id: '5511988887777', name: 'Maria Souza', opted_out: false }, mode: 'human', state: 'handoff', assigned_user_id: null, handoff_at: ago(12), last_inbound_at: ago(3), last_message_at: ago(3), window_open: true, last_message: { body: 'Oi, preciso falar com alguem sobre meu horario de amanha', direction: 'in', author: 'customer' } },
  { id: 2, contact: { wa_id: '5511977776666', name: '', opted_out: false }, mode: 'bot', state: 'idle', assigned_user_id: null, last_inbound_at: ago(90), last_message_at: ago(85), window_open: true, last_message: { body: 'Seu horario esta confirmado para amanha as 14h.', direction: 'out', author: 'bot' } },
  { id: 3, contact: { wa_id: '5511966665555', name: 'Roberto Carlos Fernandes de Almeida Junior', opted_out: true }, mode: 'bot', state: 'idle', last_inbound_at: ago(60 * 80), last_message_at: ago(60 * 80), window_open: false, last_message: { body: 'PARAR', direction: 'in', author: 'customer' } },
  { id: 4, contact: { wa_id: '5511955554444', name: 'Ana Paula', opted_out: false }, mode: 'human', state: 'handoff', assigned_user_id: 1, last_inbound_at: ago(60 * 30), last_message_at: ago(60 * 29), window_open: false, last_message: { body: 'Obrigada!', direction: 'in', author: 'customer' } },
];
const waMsgs = {
  1: [
    { id: 1, direction: 'in', author: 'customer', type: 'text', body: 'Oi, tudo bem?', status: 'received', created_at: ago(20) },
    { id: 2, direction: 'out', author: 'bot', type: 'text', body: 'Ola! Sou o assistente do Studio Teste. Como posso ajudar?', status: 'read', created_at: ago(19) },
    { id: 3, direction: 'in', author: 'customer', type: 'text', body: 'Oi, preciso falar com alguem sobre meu horario de amanha', status: 'received', created_at: ago(3) },
    { id: 4, direction: 'out', author: 'system', type: 'text', body: 'Atendimento transferido para a equipe.', status: 'sent', created_at: ago(2) },
  ],
};
let waMsgSeq = 50;
const waTemplates = [
  { name: 'lembrete_24h', language: 'pt_BR', category: 'UTILITY', purpose: 'reminder', body_preview: 'Ola {{1}}, lembrando do seu horario de {{2}} amanha as {{3}}.', param_count: 3, status: 'approved', synced_at: ago(100) },
  { name: 'agendamento_confirmado', language: 'pt_BR', category: 'UTILITY', purpose: 'booking_confirmed', body_preview: 'Ola {{1}}, seu agendamento foi confirmado.', param_count: 1, status: 'approved', synced_at: ago(100) },
  { name: 'retomar_conversa', language: 'pt_BR', category: 'MARKETING', purpose: 'agent_reopen', body_preview: 'Ola {{1}}, podemos continuar nossa conversa?', param_count: 1, status: 'pending', synced_at: ago(100) },
];
const waSettings = { bot_enabled: true, ai_enabled: true, welcome_text: 'Ola! Seja bem-vindo ao Studio Teste.', ai_daily_token_limit: null };

function billingOverview() {
  const premium = PLAN !== 'free';
  const base = { plan_code: PLAN, plan_name: premium ? 'Premium' : 'Free', source: premium ? 'paid' : 'free', commission_bps: premium ? 50 : 500, paid_through: premium ? day(7) : null, features: { assistant_monthly_interactions: MONTHLY_LIMIT, assistant_actions: premium } };
  return { subscriptions_enabled: true, entitlement: base, subscription: premium ? { status: 'active', price_cents: 4990, next_due_date: day(7) } : null, pending_invoice_url: null };
}

function handleExtra(req, res, url, body) {
  const p = url.pathname;
  const m = req.method;
  const done = (fn) => { fn(); return true; };
  const group = p.startsWith('/billing') ? 'billing' : p.startsWith('/whatsapp') ? 'whatsapp' : (p.startsWith('/professionals') || p.startsWith('/availability-rules') || p.startsWith('/time-blocks')) ? 'professionals' : '';
  if (group && FAIL.includes(group)) return done(() => coded(res, 500, 'internal_error', 'Erro interno simulado.'));

  if (p === '/billing/plans') {
    return done(() => send(res, 200, { data: [{ code: 'free', name: 'Free', price_cents: 0, commission_bps: 500 }, { code: 'premium', name: 'Premium', price_cents: 4990, commission_bps: 50 }] }));
  }
  if (p === '/billing/subscription') {
    if (m === 'POST') {
      if (body.plan_code === 'premium') return done(() => send(res, 200, { data: { ...billingOverview(), pending_invoice_url: 'https://example.test/fatura/1', subscription: { status: 'pending', price_cents: 4990, next_due_date: day(7) } } }));
      return done(() => send(res, 200, { data: billingOverview() }));
    }
    return done(() => send(res, 200, { data: billingOverview() }));
  }
  if (p === '/billing/invoices') {
    return done(() => send(res, 200, { data: EMPTY ? [] : [
      { id: 1, due_date: day(7), period_start: day(7), period_end: day(37), plan_code: 'premium', amount_cents: 4990, status: 'pending', paid_at: null, invoice_url: 'https://example.test/fatura/1' },
      { id: 2, due_date: day(-23), period_start: day(-23), period_end: day(7), plan_code: 'premium', amount_cents: 4990, status: 'paid', paid_at: day(-22), invoice_url: 'https://example.test/fatura/2' },
      { id: 3, due_date: day(-53), period_start: day(-53), period_end: day(-23), plan_code: 'premium', amount_cents: 4990, status: 'overdue', paid_at: null, invoice_url: '' },
    ] }));
  }
  if (p === '/billing/commissions') {
    const items = EMPTY ? [] : [
      { id: 1, created_at: day(-1), sale_id: 1203, plan_code: 'premium', gross_cents: 12000, commission_bps: 50, commission_cents: 60, status: 'settled', settled_at: day(0) },
      { id: 2, created_at: day(-2), sale_id: 1198, plan_code: 'free', gross_cents: 8500, commission_bps: 500, commission_cents: 425, status: 'pending', settled_at: null },
      { id: 3, created_at: day(-4), sale_id: 1180, plan_code: 'premium', gross_cents: 20000, commission_bps: 50, commission_cents: 100, status: 'refunded', settled_at: null },
    ];
    return done(() => send(res, 200, { data: { items, totals_settled: EMPTY ? { gross_cents: 0, commission_cents: 0, net_cents: 0 } : { gross_cents: 12000, commission_cents: 60, net_cents: 11940 } } }));
  }

  if (p === '/professionals' && m === 'GET') return done(() => send(res, 200, { data: url.searchParams.get('include_inactive') ? pros : pros.filter((x) => x.active) }));
  if (p === '/professionals' && m === 'POST') {
    const pro = { id: nextPro++, active: true, color: '#4a90e2', service_ids: [], ...body };
    pros.push(pro);
    return done(() => send(res, 201, { data: pro }));
  }
  const pr = p.match(/^\/professionals\/(\d+)$/);
  if (pr) {
    const pro = pros.find((x) => x.id === Number(pr[1]));
    if (!pro) return done(() => coded(res, 404, 'professional_not_found', 'Profissional nao encontrado.'));
    if (m === 'PATCH') Object.assign(pro, body);
    if (m === 'DELETE') pro.active = false;
    return done(() => send(res, 200, { data: pro }));
  }
  if (p === '/availability-rules' && m === 'GET') return done(() => send(res, 200, { data: rules }));
  if (p.startsWith('/availability-rules/professional/') && m === 'PUT') {
    rules = (body.rules || []).map((r) => ({ ...r, start_time: r.start_time + ':00', end_time: r.end_time + ':00' }));
    return done(() => send(res, 200, { data: rules }));
  }
  if (p === '/time-blocks' && m === 'POST') {
    const b = { id: 600 + extraBlocks.length, source: 'manual', professional_id: body.professional_id ?? null, starts_at: String(body.starts_at || '').replace(' ', 'T'), ends_at: String(body.ends_at || '').replace(' ', 'T'), reason: body.reason || '' };
    extraBlocks.push(b);
    return done(() => send(res, 201, { data: b }));
  }
  if (p === '/time-blocks' && m === 'GET') return done(() => send(res, 200, { data: EMPTY ? [] : [...timeBlocks(), ...extraBlocks] }));

  if (p.startsWith('/whatsapp')) {
    if (WA_MODE === 'off') return done(() => coded(res, 404, 'not_found', 'Recurso indisponivel.'));
    const statusBody = () => ({ enabled: WA_MODE !== 'disabled', display_phone: '+55 11 4000-1234', wa_link: 'https://wa.me/551140001234?text=Ola', booking_ready: true, settings: waSettings, ai_tokens_today: 4200 });
    if (p === '/whatsapp/status') return done(() => send(res, 200, { data: statusBody() }));
    if (p === '/whatsapp/config' && m === 'PUT') {
      if (ROLE !== 'admin') return done(() => coded(res, 403, 'admin_required', 'Apenas administradores.'));
      Object.assign(waSettings, body);
      return done(() => send(res, 200, { data: statusBody() }));
    }
    if (p === '/whatsapp/usage') {
      const exceeded = WA_MODE === 'exceeded';
      return done(() => send(res, 200, { data: { period: url.searchParams.get('period') || new Date().toISOString().slice(0, 7), plan: PLAN, messages: { used: exceeded ? 50 : PLAN === 'free' ? 41 : 312, limit: PLAN === 'free' ? 50 : null }, breakdown: { inbound: 140, bot_replies: 98, billable: 41, delivered: 38, read: 30, failed: 2 }, ai: { tokens: 18200, calls: 64, daily_limit: 50000 } } }));
    }
    if (p === '/whatsapp/templates') return done(() => send(res, 200, { data: EMPTY ? [] : waTemplates }));
    if (p === '/whatsapp/conversations' && m === 'GET') return done(() => send(res, 200, { data: waConvs }));
    const wc = p.match(/^\/whatsapp\/conversations\/(\d+)(?:\/(messages|assume|release))?$/);
    if (wc) {
      const conv = waConvs.find((c) => c.id === Number(wc[1]));
      if (!conv) return done(() => coded(res, 404, 'conversation_not_found', 'Conversa nao encontrada.'));
      if (!wc[2]) return done(() => send(res, 200, { data: conv }));
      if (wc[2] === 'assume') { conv.mode = 'human'; conv.assigned_user_id = 1; return done(() => send(res, 200, { data: conv })); }
      if (wc[2] === 'release') { conv.mode = 'bot'; conv.assigned_user_id = null; return done(() => send(res, 200, { data: conv })); }
      if (m === 'POST') {
        if (!conv.window_open && !body.template) return done(() => coded(res, 409, 'window_closed', 'A janela de 24 horas esta fechada. Envie um modelo.'));
        const msg = { id: waMsgSeq++, direction: 'out', author: 'agent', type: body.template ? 'template' : 'text', body: body.text || 'Modelo enviado', template_name: body.template || '', status: 'sent', created_at: ago(0) };
        (waMsgs[conv.id] = waMsgs[conv.id] || []).push(msg);
        return done(() => send(res, 201, { data: msg }));
      }
      return done(() => send(res, 200, { data: waMsgs[conv.id] || [{ id: 1, direction: 'in', author: 'customer', type: 'text', body: conv.last_message ? conv.last_message.body : '', status: 'received', created_at: ago(30) }] }));
    }
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Selected-company');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After'); // A9: o front lê Retry-After via CORS
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
  const p = url.pathname;

  if (handleExtra(req, res, url, body)) return;
  if (p.startsWith('/assistant')) return handleAssistant(req, res, url, body);
  if (p.startsWith('/integrations/instagram')) return handleInstagram(req, res, url, body);
  if (p.startsWith('/integrations/google-calendar')) return handleGoogle(req, res, url, body);
  if (p === '/professionals') return send(res, 200, { data: professionals });
  if (p === '/time-blocks' && req.method === 'GET') return send(res, 200, { data: timeBlocks() });
  const del = p.match(/^\/time-blocks\/(\d+)$/);
  if (del && req.method === 'DELETE') {
    if (del[1] === '501') return coded(res, 409, 'time_block_managed_by_google', 'Este bloqueio vem do Google Agenda e não pode ser removido aqui.');
    return send(res, 200, { data: { deleted: true } });
  }
  // "Login" do provedor (simulado): volta para a redirect_uri (somente localhost) com code+state, ou com error se ?deny=1.
  const auth = p.match(/^\/mock\/authorize\/(instagram|google-calendar)$/);
  if (auth) {
    const redirect = url.searchParams.get('redirect_uri') || '';
    let target;
    try { target = new URL(redirect); } catch { target = null; }
    if (!target || target.hostname !== 'localhost') { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('redirect_uri inválida (o mock só aceita localhost)'); }
    if (url.searchParams.get('deny') === '1') { target.searchParams.set('error', 'access_denied'); target.searchParams.set('error_description', 'O usuário recusou a autorização.'); }
    else target.searchParams.set('code', 'mock-code-' + Date.now());
    target.searchParams.set('state', url.searchParams.get('state') || '');
    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }
  if (p === '/users') return send(res, 200, { returnObj: { id: 1, name: 'Usuário de Teste', email: 'teste@example.test', permission: ROLE === 'admin' ? 1 : 2, companies: [1] } });
  if (p === '/companies') return send(res, 200, { returnObj: { id: 1, name: 'Studio Teste', asaas_status: 'APPROVED', roles: [], services: [{ id: 1, name: 'Corte' }, { id: 2, name: 'Escova' }], products: [] } });
  if (p === '/companies/business_types' || p === '/utils/units_of_measurement') return send(res, 200, { returnObj: [] });
  if (p === '/billing/subscription') {
    return send(res, 200, { data: { entitlement: { plan_code: PLAN, plan_name: PLAN === 'free' ? 'Free' : 'Premium', features: { assistant_monthly_interactions: MONTHLY_LIMIT, assistant_actions: PLAN !== 'free' } } } });
  }
  return send(res, 404, { message: 'rota do mock não implementada: ' + p });
});

server.listen(PORT, () => console.log(`[mock-core] http://localhost:${PORT} role=${ROLE} plan=${PLAN} disabled=${DISABLED} kbLimit=${KB_LIMIT}`));
