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

Menu **Assistente** (ESTABELECIMENTO, qualquer membro), só aparece se o core responder ao teste de disponibilidade (`GET /assistant/conversations`; `503 assistant_disabled` ou `404` escondem item e telas). Abas:

- `/assistente/conversa`: histórico de conversas (`GET /assistant/conversations`, `GET .../:id`), envio (`POST .../:id/messages`, JSON, sem SSE) com indicador de carregamento e bloqueio de envio duplicado. Se a resposta se perder (rede, 502, dyno dormindo), a mensagem **nunca é reenviada sozinha**: a tela consulta `message_count` da conversa até reconciliar. Mostra o uso mensal (barra e aviso perto do limite).
- **Ação proposta**: cartão com resumo, risco, prévia dos parâmetros (campos internos ficam ocultos), contagem regressiva de expiração e botões **Confirmar** / **Rejeitar**. Só o `confirm_token` do core é enviado (`POST /assistant/actions/:id/confirm|reject`); nada é executado sem o clique. O token vive apenas em memória: ao recarregar, a ação pendente aparece sem token e o cartão pede para perguntar de novo ao assistente.
- `/assistente/conhecimento` (**somente admin**): base de conhecimento (RAG) com listar, adicionar, editar (PUT com o corpo completo) e remover (o core não tem "ativo/inativo"). Mostra aviso de LGPD e o contador N/500. Não administradores nem chamam a rota (o core devolve 401, que derrubaria a sessão).

Erros tratados: `402 plan_upgrade_required` (aviso com botão de upgrade, além do modal global), `429 rate_limited` (contagem regressiva por `retry_after`), `429 assistant_budget_exceeded`, `503 assistant_actions_disabled`, resposta degradada (`source` template/fallback) e erros de rede.

Segurança: o texto da IA nunca usa `v-html`; passa por um parser próprio (`utils/safeText.js`) que só gera texto, negrito, listas e links, e os links só são aceitos para `https://agendaspro.com.br`, caminhos relativos e `mailto:`.

Código: lógica pura em `utils/assistant.js` e `utils/safeText.js`, estado/ações em `utils/assistantController.js` (plugin `$assistant`), telas em `pages/assistente*` e `components/Assistant/`. Testes: `npm test` (`tests/assistant*.test.js`, `tests/safeText.test.js`).

Teste visual sem o core: `node dev/mock-core.mjs` (só desenvolvimento, não entra no build; porta 3001, igual ao `NUXT_PUBLIC_API_BASE` padrão do `nuxt dev`). Variáveis: `MOCK_ROLE=admin|member`, `MOCK_PLAN=free|premium`, `MOCK_DISABLED=1`. Palavras na mensagem disparam cenários: `agendar` (ação proposta), `limite` (402), `devagar` (429), `caiu` (resposta perdida), `link` (links perigosos), `orcamento`, `premium`, `desligar`, `markdown`. Para entrar, grave `agendaspro_jwt`, `agendaspro_refresh_token` e `selected_company` no `localStorage`.
