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
