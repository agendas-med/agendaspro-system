// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_HEADERS, buildCsp, buildHeadersFile, inlineScriptHashes } from './config/securityHeaders.mjs';

// Valores de runtime (sobrescritos por NUXT_PUBLIC_*). Ver .env.example.
const apiBase = process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001';
const googleClientId = process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || '';

export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      apiBase,
      siteUrl,
      googleClientId,
    },
  },
  compatibilityDate: '2024-04-03',
  app: {
    // Troca de rota e de layout: fade curto (tokens em assets/css/motion.css). Só opacidade, sem transform.
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'layout', mode: 'out-in' },
    head: {
      htmlAttrs: {
        lang: 'pt-BR',
      },
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    },
  },
  // Cabeçalhos simples aplicados por qualquer servidor Nitro (preview/node). A CSP é gerada no
  // hook abaixo (precisa dos hashes dos scripts inline) e vai em public/_headers.
  routeRules: {
    '/**': { headers: { ...BASE_HEADERS } },
  },
  hooks: {
    // Ao final do `nuxt generate`, grava _headers (Netlify/Cloudflare Pages) com a CSP calculada.
    'nitro:init'(nitro) {
      nitro.hooks.hook('prerender:done', () => {
        const publicDir = nitro.options.output.publicDir;
        if (!publicDir || !existsSync(publicDir)) return;

        const htmlFiles = readdirSync(publicDir).filter((file) => file.endsWith('.html'));
        const hashes = new Set();
        for (const file of htmlFiles) {
          for (const hash of inlineScriptHashes(readFileSync(join(publicDir, file), 'utf8'))) hashes.add(hash);
        }

        const csp = buildCsp({ apiBase, scriptHashes: [...hashes], googleEnabled: !!googleClientId });
        writeFileSync(join(publicDir, '_headers'), buildHeadersFile({ csp }));
      });
    },
  },
  devServer: {
    host: '0.0.0.0',
    port: 8080
  },
  devtools: { enabled: false },
  css: ['~/assets/css/main.css', '~/assets/css/integrations.css', '~/assets/css/ui.css', '~/assets/css/motion.css', '@fortawesome/fontawesome-svg-core/styles.css'],
  fontawesome: {
    icons: {
      solid: ['face-smile', 'child', 'archive', 'envelope', 'pen-clip', 'circle', 'comment', 'times', 'store', 'calendar-day', 'user-group',
        'chart-simple', 'wallet', 'bars', 'angle-down','search', 'filter', 'arrow-down-wide-short', 'trash', 'circle-plus', 'user-lock', 'angle-left', 'angle-right', 'angle-down',
        'backward-step', 'location-dot', 'forward-step', 'plus', 'user-pen', 'gear', 'pen', 'circle-info', 'trash-can', 'circle-check', 'circle-play', 'circle-stop', 'circle-xmark', 'triangle-exclamation', 'bag-shopping', 'dolly', 'rotate-left', 'copy', 'circle-notch', 'clock', 'ban', 'user-tie', 'credit-card', 'comments', 'paper-plane', 'wand-magic-sparkles', 'book-open', 'lock', 'shield-halved', 'plug', 'rotate', 'heart', 'arrow-up-right-from-square'],
      regular: ['comment', 'face-smile'],
      brands: ['twitter', 'instagram', 'google'],
    },
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  ssr: false,
  plugins: [
    '~/plugins/myFunctions.js',
    '~/plugins/global.js',
    { src: '~/plugins/fullcalendar.js', mode: 'client' },
    { src: '~/plugins/jquery.js', mode: 'client' },
    { src: '~/plugins/moment.js', mode: 'client' }
  ],
  modules: ['@vesp/nuxt-fontawesome']
})
