// SOMENTE DESENVOLVIMENTO. Core falso para testar visualmente as telas do assistente sem o core real.
// Não é importado pelo app nem entra no build (fica fora de pages/, plugins/, components/ e utils/).
//
// Uso:  node dev/mock-core.mjs            (porta 3001 = NUXT_PUBLIC_API_BASE padrão do `nuxt dev`)
//   MOCK_PORT=3001   porta
//   MOCK_ROLE=admin  admin (permission 1) | member (outro valor)
//   MOCK_PLAN=free   free (somente consulta, cota 20) | premium
//   MOCK_DISABLED=1  assistente desligado (503 assistant_disabled)
//
// Palavras-chave para disparar cenários no chat:
//   "agendar"  -> resposta com ação proposta (confirm_token)      "limite"  -> 402 cota esgotada
//   "devagar"  -> 429 com retry_after                             "caiu"    -> grava a resposta mas devolve 502 (recuperação)
//   "link"     -> resposta com links/HTML perigosos               "orcamento" -> 429 assistant_budget_exceeded
//   "premium"  -> 402 de recurso (feature) depois de gravar       "desligar" -> actions_disabled depois de gravar
// Não tem segredos nem acesso a nada: tudo em memória.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 3001);
const ROLE = process.env.MOCK_ROLE || 'admin';
const PLAN = process.env.MOCK_PLAN || 'premium';
const DISABLED = process.env.MOCK_DISABLED === '1';
const MONTHLY_LIMIT = PLAN === 'free' ? 20 : 500;

const conversations = new Map();
const actions = new Map();
const knowledge = [
  { id: 1, kind: 'faq', title: 'Horário de funcionamento', content: 'Abrimos de segunda a sábado, das 9h às 18h.', updated_at: new Date().toISOString() },
  { id: 2, kind: 'policy', title: 'Cancelamento', content: 'Cancelamentos com menos de 2 horas de antecedência podem ser cobrados.', updated_at: new Date().toISOString() },
];
let nextKnowledge = 3;
let used = 7;
let seq = 1;

const wall = (d = new Date()) => new Date(d.getTime() + 3 * 3600 * 1000).toISOString(); // core: hora local + 3h com "Z"
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const coded = (res, status, code, message, extra = {}) => send(res, status, { error: { code, message, ...extra } });
const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

const view = (c) => ({ id: c.id, title: c.title, message_count: c.messages.length, created_at: c.created_at, updated_at: c.updated_at });

function newReply(c, text) {
  const t = text.toLowerCase();
  const reply = { text: 'Claro! Posso ajudar com isso.', citations: [{ source_type: 'knowledge', source_id: '1', score: 0.82 }, { source_type: 'service', source_id: '3', score: 0.6 }], action: null };
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
  }
  return reply;
}

async function handleAssistant(req, res, url, body) {
  if (DISABLED) return coded(res, 503, 'assistant_disabled', 'Assistente desligado.');
  const path = url.pathname;
  const method = req.method;

  if (path === '/assistant/conversations' && method === 'GET') {
    return send(res, 200, { data: [...conversations.values()].map(view) });
  }
  if (path === '/assistant/conversations' && method === 'POST') {
    const id = 'c' + seq++;
    const c = { id, title: '', messages: [], created_at: wall(), updated_at: wall() };
    conversations.set(id, c);
    return send(res, 201, { data: view(c) });
  }
  let m = path.match(/^\/assistant\/conversations\/([^/]+)$/);
  if (m && method === 'GET') {
    const c = conversations.get(m[1]);
    if (!c) return coded(res, 404, 'not_found', 'Conversa não encontrada.');
    const pending = [...actions.values()].filter((a) => a.conversation === c.id && a.state === 'pending' && new Date(a.expiresAt) > new Date()).map((a) => ({
      action_id: a.id, tool: a.tool, risk: 'medium', summary: 'Agendar Corte de cabelo para Maria Souza amanhã às 14h com a Joana.', expires_at: a.expiresAt,
    }));
    return send(res, 200, { data: { ...view(c), messages: c.messages, pending_actions: pending } });
  }
  m = path.match(/^\/assistant\/conversations\/([^/]+)\/messages$/);
  if (m && method === 'POST') {
    const c = conversations.get(m[1]);
    if (!c) return coded(res, 404, 'not_found', 'Conversa não encontrada.');
    const text = String(body.message || '');
    const t = text.toLowerCase();
    if (t.includes('limite')) return coded(res, 402, 'plan_upgrade_required', 'Você usou todas as interações do mês.', { plan: PLAN, quota: 'assistant_monthly_interactions', limit: MONTHLY_LIMIT, used: MONTHLY_LIMIT });
    if (t.includes('devagar')) return send(res, 429, { error: { code: 'rate_limited', message: 'Calma.', retry_after: 8 } });
    if (t.includes('orcamento')) return coded(res, 429, 'assistant_budget_exceeded', 'Orçamento de IA esgotado.');
    c.messages.push({ role: 'user', content: text, source: 'user', created_at: wall() });
    if (!c.title) c.title = text.slice(0, 40);
    used += 1;
    if (t.includes('premium')) { c.updated_at = wall(); return coded(res, 402, 'plan_upgrade_required', 'Ações pelo assistente exigem o plano Premium.', { plan: 'free', feature: 'assistant_actions' }); }
    if (t.includes('desligar')) { c.updated_at = wall(); return coded(res, 503, 'assistant_actions_disabled', 'Ações desativadas.'); }
    const r = newReply(c, text);
    c.messages.push({ role: 'assistant', content: r.text, source: t.includes('markdown') ? 'template' : 'ai', created_at: wall() });
    c.updated_at = wall();
    if (t.includes('caiu')) return send(res, 502, undefined); // gravou, mas a resposta se perde
    await new Promise((r2) => setTimeout(r2, 900));
    return send(res, 200, { data: { reply: r.text, citations: r.citations, proposed_actions: r.action ? [r.action] : [], truncated: false, usage: { interactions_used: used, interactions_limit: MONTHLY_LIMIT } } });
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
    if (ROLE !== 'admin') return send(res, 401, { message: 'Não autorizado' });
    if (path === '/assistant/knowledge' && method === 'GET') return send(res, 200, { data: knowledge });
    if (path === '/assistant/knowledge' && method === 'POST') {
      const item = { id: nextKnowledge++, kind: body.kind, title: body.title, content: body.content, updated_at: new Date().toISOString() };
      knowledge.push(item);
      return send(res, 201, { data: item });
    }
    m = path.match(/^\/assistant\/knowledge\/(\d+)$/);
    const idx = m ? knowledge.findIndex((k) => k.id === Number(m[1])) : -1;
    if (m && idx < 0) return send(res, 404, { message: 'Não encontrado' });
    if (m && method === 'PUT') { knowledge[idx] = { ...knowledge[idx], kind: body.kind, title: body.title, content: body.content }; return send(res, 200, { data: knowledge[idx] }); }
    if (m && method === 'DELETE') { knowledge.splice(idx, 1); return send(res, 200, { data: { ok: true } }); }
  }
  return send(res, 404, { message: 'rota do mock não implementada' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Selected-company');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
  const p = url.pathname;

  if (p.startsWith('/assistant')) return handleAssistant(req, res, url, body);
  if (p === '/users') return send(res, 200, { returnObj: { id: 1, name: 'Usuário de Teste', email: 'teste@example.test', permission: ROLE === 'admin' ? 1 : 2, companies: [1] } });
  if (p === '/companies') return send(res, 200, { returnObj: { id: 1, name: 'Studio Teste', asaas_status: 'APPROVED', roles: [], services: [], products: [] } });
  if (p === '/companies/business_types' || p === '/utils/units_of_measurement') return send(res, 200, { returnObj: [] });
  if (p === '/billing/subscription') {
    return send(res, 200, { data: { entitlement: { plan_code: PLAN, plan_name: PLAN === 'free' ? 'Free' : 'Premium', features: { assistant_monthly_interactions: MONTHLY_LIMIT, assistant_actions: PLAN !== 'free' } } } });
  }
  return send(res, 404, { message: 'rota do mock não implementada: ' + p });
});

server.listen(PORT, () => console.log(`[mock-core] http://localhost:${PORT} role=${ROLE} plan=${PLAN} disabled=${DISABLED}`));
