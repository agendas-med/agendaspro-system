// Cabeçalhos de segurança do front (SPA estático).
// - Os cabeçalhos "simples" entram em routeRules (nuxt.config.ts) e em public/_headers (gerado no build).
// - A CSP é gerada no fim do build por `buildCsp`, porque o Nuxt injeta scripts inline na SPA
//   (window.__NUXT__ / runtimeConfig) e cada um precisa do seu hash sha256 em vez de 'unsafe-inline'.
import { createHash } from 'node:crypto';

export const BASE_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// Retorna 'sha256-...' de cada <script> inline (sem src) de um HTML.
export function inlineScriptHashes(html) {
  const hashes = new Set();
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    if (/type\s*=\s*["']?(application\/json|application\/ld\+json|importmap)/i.test(attrs)) continue;
    hashes.add("'sha256-" + createHash('sha256').update(body).digest('base64') + "'");
  }
  return [...hashes];
}

export function buildCsp({ apiBase, scriptHashes = [], googleEnabled = true } = {}) {
  const apiOrigin = originOf(apiBase);
  const google = googleEnabled ? ['https://accounts.google.com'] : [];

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...scriptHashes, ...(googleEnabled ? ['https://accounts.google.com/gsi/client'] : [])],
    'style-src': ["'self'", "'unsafe-inline'", ...(googleEnabled ? ['https://accounts.google.com/gsi/style'] : [])],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", apiOrigin, 'https://viacep.com.br', ...google].filter(Boolean),
    'frame-src': google.length ? google : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => name + ' ' + values.join(' '))
    .join('; ');
}

// Conteúdo do arquivo _headers (Netlify / Cloudflare Pages).
export function buildHeadersFile({ csp }) {
  const lines = ['/*'];
  for (const [name, value] of Object.entries(BASE_HEADERS)) lines.push('  ' + name + ': ' + value);
  if (csp) lines.push('  Content-Security-Policy: ' + csp);
  lines.push('', '/*.html', '  Cache-Control: no-cache', '');
  return lines.join('\n');
}
