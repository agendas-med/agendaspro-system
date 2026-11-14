# agendaspro-system

Front-end Nuxt 3 + Tailwind do AgendasPro. A API é `../agendaspro-core` (suba o MariaDB e a API primeiro). `NUXT_PUBLIC_API_BASE` define o backend (padrão `http://localhost:3001`); em dev o site abre em `http://localhost:8080`. Regras de publicação e de interface da pasta pai: `../AGENTS.md`.

Scripts: `dev`, `build`, `generate`, `preview`. Valide mudanças com `npm run build`.

- Repo **público** no GitHub (`agendas-med/agendas-med-system`).

## Regras comuns

- `.env*` nunca é lido, impresso nem commitado (nomes das variáveis: `.env.example`, quando existir).
- Sem `git push`/deploy sem pedido; commits com caminhos explícitos (nada de `git add .`).
- Os comandos citados vêm do `package.json` (quando o repo tem um) e **não foram executados** (`node`/`npm` fora do PATH nesta máquina). Confirme antes de afirmar que passam.
