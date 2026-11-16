# Nuxt 3 Minimal Starter

## Ambiente local AgendasPro

Suba primeiro o MariaDB e a API conforme o README de `agendaspro-core`. Execute `npm run dev` e acesse `http://localhost:8080`. A variável `NUXT_PUBLIC_API_BASE` define o backend (padrão `http://localhost:3001`). Para produção, configure a URL pública da API. Valide a compilação com `npm run build`.

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm run dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm run build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm run preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## WhatsApp (F4)

Menu **WhatsApp** (ESTABELECIMENTO, qualquer membro) com duas abas:

- `/whatsapp/conversas`: caixa de entrada (`GET /whatsapp/conversations`, filtro por estado, "Carregar mais"), conversa aberta (`GET conversations/:id` e `/messages`, "Ver mensagens anteriores"), **Assumir** / **Devolver ao bot** (`POST .../assume|release`) e envio (`POST .../messages` com `{text}` ou `{template, params}`). Atualização leve a cada 15 s **só com a aba visível** (pausa em `visibilitychange`; sem websocket).
- `/whatsapp/configuracao`: status e número da plataforma, link `wa_link` com botão copiar e QR Code, uso do mês contra o limite do plano (convite de upgrade quando excedido), configuração do bot/IA (**somente admin**; os demais veem os campos desabilitados) e lista somente leitura de modelos aprovados/pendentes.

Erros de envio tratados na conversa: `409 window_closed` (abre o seletor de modelo), `409 opted_out` (envio bloqueado), `409 template_unavailable`, `400 template_params`, `402 plan_upgrade_required` (modal global + aviso na conversa com link para `/billing/plano`), `404 conversation_not_found` e `502 send_failed`.

Segurança: nomes e mensagens de clientes são sempre interpolados como texto (nenhum `v-html`); o link do WhatsApp só é usado se tiver a forma `https://wa.me/<número>`. Dependência nova: `qrcode-generator` (QR em SVG, sem dependências).

Código: lógica pura e testável em `utils/whatsapp.js`, `utils/qr.js` e `utils/clipboard.js`; telas em `pages/whatsapp*`; componentes em `components/Whatsapp/`. Testes: `npm test` (`tests/whatsapp*.test.js`).

## Assistente (F5)

Menu **Assistente** (ESTABELECIMENTO, qualquer membro), só aparece se `GET /assistant/status` responder `enabled: true` (`enabled: false`, `503 assistant_disabled` ou `404` escondem item e telas). O status também traz plano, cota (`usage`), `ai_available`, `actions` (com o motivo quando desativadas) e `knowledge_admin`, então a cota aparece **antes da primeira mensagem** (sem inferir pela assinatura de `/billing/subscription`; `interactions_limit: null` = sem limite). Alinhado ao core follow-up 1 (contratos A1 a A9). Abas:

- `/assistente/conversa`: histórico de conversas (`GET /assistant/conversations`, `GET .../:id`), envio (`POST .../:id/messages`, JSON, sem SSE) com indicador de carregamento e bloqueio de envio duplicado. Se a resposta se perder (rede, 502, dyno dormindo), a mensagem **nunca é reenviada sozinha**: a tela consulta `message_count` da conversa até reconciliar. Mostra o uso mensal (barra e aviso perto do limite) e um aviso discreto quando a resposta é **degradada** (`degraded: true` ou `source: fallback`); o histórico traz só `source`. As mensagens têm `id` (`user_message_id`, `message_id`, `messages[].id`), usado como chave estável.
- **Apagar conversa**: botão de lixeira por conversa, com diálogo de confirmação (`DELETE /assistant/conversations/:id`; o core expira as ações pendentes dela). `404` conta como já apagada.
- **Ação proposta**: cartão com resumo, risco, prévia dos parâmetros (campos internos ficam ocultos), contagem regressiva de expiração e botões **Confirmar** / **Rejeitar**. Só o `confirm_token` do core é enviado (`POST /assistant/actions/:id/confirm|reject`); nada é executado sem o clique. O token vive apenas em memória: ao recarregar, a ação pendente aparece sem token, com o botão **Preparar confirmação** (`POST /assistant/actions/:id/token`). Isso só gera um token novo (o antigo é invalidado, o prazo não é estendido) e **nunca confirma**: o usuário ainda clica em Confirmar. Abrir uma conversa não chama `/token` nem `/confirm`.
- `/assistente/conhecimento` (**somente admin**): base de conhecimento (RAG) com listar, adicionar (POST), editar e ativar/desativar (**PATCH parcial**, só os campos alterados) e remover. Cada texto tem `active`; só os ativos entram nas respostas (a tela mostra "N ativos" e a etiqueta "Inativo"). Mostra aviso de LGPD e o contador N/500. Não administradores nem chamam a rota.

Erros com código (`{ error: { code, message } }`): `402 plan_upgrade_required` (aviso com botão de upgrade, além do modal global), `429 rate_limited` (contagem regressiva por `Retry-After`/`retry_after`), `429 assistant_budget_exceeded`, `503 assistant_actions_disabled`, `403 admin_required` (mostra "apenas administradores" e **não** derruba a sessão), `404 knowledge_not_found` (recarrega a lista), `409 knowledge_limit_reached` (mensagem com o limite), `400 validation_error` (`fields`/`errors` marcados em cada campo), `404 conversation_not_found` / `action_not_found` e erros de rede. Uma proposta negada (`402`/`503` de ações) não grava a pergunta nem consome cota (A7).

Datas: `created_at` vem em UTC com `Z`; a tela converte para o fuso do navegador (`formatWhen`/`formatListWhen` em `utils/assistant.js`, com o fuso injetável nos testes).

Segurança: o texto da IA nunca usa `v-html`; passa por um parser próprio (`utils/safeText.js`) que só gera texto, negrito, listas e links, e os links só são aceitos para `https://agendaspro.com.br`, caminhos relativos e `mailto:`. Todo texto vindo do core é interpolado como texto.

Código: lógica pura em `utils/assistant.js` e `utils/safeText.js`, estado/ações em `utils/assistantController.js` (plugin `$assistant`), telas em `pages/assistente*` e `components/Assistant/`. Testes: `npm test` (`tests/assistant*.test.js`, `tests/safeText.test.js`).

Teste visual sem o core: `node dev/mock-core.mjs` (só desenvolvimento, não entra no build; porta 3001, igual ao `NUXT_PUBLIC_API_BASE` padrão do `nuxt dev`). Reflete o follow-up 1 (status, ids, `source`/`degraded`, token, PATCH, erros com código, `created_at` em UTC real). Variáveis: `MOCK_ROLE=admin|member`, `MOCK_PLAN=free|premium` (cota 30 / 1000), `MOCK_DISABLED=1`, `MOCK_KB_LIMIT=N`. Palavras na mensagem disparam cenários: `agendar` (ação proposta), `limite` (402), `devagar` (429), `caiu` (resposta perdida), `link` (links perigosos), `orcamento`, `premium`, `desligar`, `markdown`, `degradar` (fallback) e `semia` (template degradado). Para entrar, grave `agendaspro_jwt`, `agendaspro_refresh_token` e `selected_company` no `localStorage`.

## Integrações (F6): Instagram e Google Agenda

Menu **Integrações** (ESTABELECIMENTO), só aparece se `GET /integrations/instagram/status` ou `GET /integrations/google-calendar/status` responder `200`. `404` ou `503` (`*_not_configured`) escondem a aba correspondente; sem nenhuma aba o item some. Quem não é admin vê o estado e os dados, mas não os botões de conectar, desconectar ou editar vínculos (o core também recusa com `403 admin_required`, que não derruba a sessão). Contrato: `agendaspro-core/docs/contratos-f6.md`.

**Instagram** (`/integracoes/instagram`):

- Estados: desconectado, conectando (redirecionamento), conectado, `reauth_required` (reconectar) e erro. Conectar = `POST /connect/start` com a `redirect_uri` do próprio app (`/oauth/instagram`), depois `POST /callback {code, state}`. O retorno do provedor limpa a query da URL antes de qualquer chamada, usa o `state` uma única vez e mostra o motivo se o usuário recusar (`error=access_denied`) ou o `state` expirar.
- Desconectar (admin) pede confirmação e explica o que acontece com os dados (LGPD). `POST /disconnect`.
- Blocos independentes (cada um com carregando, vazio, erro com "tentar de novo" e bloqueio): perfil, grade de posts, engajamento (com a fórmula e a base: alcance ou seguidores), insights com gráficos SVG de histórico (7/30/90 dias; "visitas ao perfil" não é fornecida pelo Instagram), funil de conversão e gerador de links UTM (copiar e QR Code).
- **Free**: conexão, perfil, 6 posts e link da bio. **Premium** (sinal: `overview.premium`): insights, histórico, conversão, comparação e links por post, story e campanha. Blocos bloqueados mostram o convite de upgrade para `/billing/plano` (somente admin). Cargas passivas usam `suppressUpgradePrompt`; só ações do usuário abrem o modal global de 402.

**Google Agenda** (`/integracoes/google-agenda`):

- Conectar (admin, **Premium**; `402` no Free abre o modal) e desconectar (qualquer plano, com a opção `remove_app_calendars` e aviso do que muda). `reauth_required` pede reconexão. No Free, uma conta já conectada aparece como **pausada** (sem sincronizar).
- Vínculos por profissional: **enviar** (`push`, o app grava os agendamentos no Google; atraso de até 1 h) e **ocupado** (`busy`, eventos do Google bloqueiam horários). Escolha de calendário (`GET /calendars`), criação e remoção (`/links`).
- Status da sincronização e **Sincronizar agora** (`POST /sync`, `202`; limite de 6 por hora, `429` mostra quando tentar de novo). O Premium é lido de `GET /billing/subscription` (`entitlement.plan_code`).
- Bloqueios importados aparecem somente leitura (`GET /time-blocks`, `source: "google"`), também em Profissionais > Bloqueios (etiqueta "Google", sem botão de remover; o core responde `409` se tentarem).

Código: lógica pura em `utils/instagram.js`, `utils/googleCalendar.js` e `utils/integrations.js`; controladores reativos `utils/instagramController.js` (`$instagram`) e `utils/googleCalendarController.js` (`$googleCalendar`), expostos por `plugins/integrations.js`; telas em `pages/integracoes*` e `pages/oauth/*`; componentes em `components/Integrations/`, `components/Instagram/` e `components/GoogleCalendar/`. Texto vindo do core ou do Instagram (legendas, nomes) é sempre interpolado como texto, sem `v-html`; links externos só com `https`. Testes: `npm test` (`tests/instagram*.test.js`, `tests/googleCalendar*.test.js`, `tests/integrations.test.js`).

Teste visual com o mock: além de `MOCK_ROLE` e `MOCK_PLAN`, use `MOCK_IG` e `MOCK_GCAL` = `disconnected` (padrão) | `connected` | `reauth` | `notconfigured` (503) | `off` (404, core sem F6). O "login" do provedor é simulado em `/mock/authorize/<provedor>` (volta para a `redirect_uri` em localhost; acrescente `&deny=1` à URL para simular a recusa). No Free o mock devolve `402` em insights, conversão, links não-bio e na conexão do Google; `sync` responde `429` na sétima chamada.
