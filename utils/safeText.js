// Renderização SEGURA de texto vindo da IA/servidor: nunca HTML. O texto vira uma árvore de nós
// (parágrafos, listas, negrito, links) que o componente percorre com v-for e interpolação ({{ }}).
// Links só passam por safeHref: https/mailto com host na allowlist, ou caminho interno do próprio painel.
// Adaptado de agendaspro-site/src/lib/chatText.js (mesma política de links).

export const MAX_TEXT = 4000;
const MAX_URL = 2048;

// Pontos de código proibidos (hex): controles (menos \n e \t), DEL, largura zero/bidi e BOM.
// Feito por código (sem escapes na regex) para não depender de caracteres invisíveis no fonte.
const BAD_RANGES = [
  [0x0, 0x8],
  [0xb, 0x1f],
  [0x7f, 0x7f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const isBadCode = (c) => BAD_RANGES.some(([a, b]) => c >= a && c <= b);
const stripBad = (str) => Array.from(str).filter((ch) => !isBadCode(ch.codePointAt(0))).join("");
const BACKSLASH = String.fromCharCode(92);
const hasUnsafeChar = (str) =>
  Array.from(str).some((ch) => {
    const c = ch.codePointAt(0);
    return /\s/.test(ch) || ch === BACKSLASH || c < 0x20 || isBadCode(c);
  });

/** Remove controles/bidi, normaliza quebras de linha e limita o tamanho. */
export function cleanText(text, max = MAX_TEXT) {
  return stripBad(String(text ?? "").replace(/\r\n?/g, "\n")).slice(0, max);
}

const hostMatches = (host, allowed) => allowed.some((a) => host === a || host.endsWith(`.${a}`));

/**
 * Valida uma URL vinda do servidor/IA. Devolve a URL normalizada ou null.
 * - mailto: endereço simples, sem parâmetros.
 * - caminho interno ("/agenda"): só com allowRelative (nunca "//host" nem barra invertida).
 * - https: sem credenciais; host na allowlist (igual ou subdomínio).
 * - http só para localhost e só com allowLocalHttp (dev).
 */
export function safeHref(url, { allowedHosts = [], allowRelative = true, allowLocalHttp = false } = {}) {
  const raw = String(url ?? "").trim();
  if (!raw || raw.length > MAX_URL || hasUnsafeChar(raw)) return null;
  if (/^mailto:/i.test(raw)) {
    return /^mailto:[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/i.test(raw) ? raw : null;
  }
  if (raw.startsWith("/")) {
    if (!allowRelative || raw.startsWith("//")) return null;
    return raw;
  }
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (u.protocol === "http:") {
    if (!(allowLocalHttp && isLocal)) return null;
  } else if (u.protocol !== "https:") {
    return null;
  }
  if (!(allowLocalHttp && isLocal) && !hostMatches(host, allowedHosts || [])) return null;
  return u.href;
}

/** Link externo (fora do painel)? Define target=_blank + rel. */
export function isExternalHref(href, ownHosts = []) {
  if (!href || href.startsWith("/")) return false;
  if (/^mailto:/i.test(href)) return false;
  try {
    return !hostMatches(new URL(href).hostname.toLowerCase(), ownHosts);
  } catch (e) {
    return true;
  }
}

const INLINE_RE = /\*\*([^*\n]{1,200})\*\*|\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)|(https:\/\/[^\s<>"')\]]+)|(mailto:[^\s<>"')\]]+)/g;
const TRAILING_PUNCT = /[.,;:!?]+$/;

function parseInline(line, opts) {
  const out = [];
  let last = 0;
  const pushText = (s) => {
    if (s) out.push({ t: "text", v: s });
  };
  for (const m of line.matchAll(INLINE_RE)) {
    pushText(line.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      out.push({ t: "strong", v: m[1] });
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3], opts);
      // Link inválido: mostra só o rótulo (nunca o destino como link).
      if (href) out.push({ t: "link", v: m[2], href });
      else pushText(m[2]);
    } else {
      let url = m[4] || m[5];
      let tail = "";
      const p = url.match(TRAILING_PUNCT);
      if (p) {
        tail = p[0];
        url = url.slice(0, -tail.length);
      }
      const href = safeHref(url, opts);
      if (href) out.push({ t: "link", v: url, href });
      else pushText(url);
      pushText(tail);
    }
  }
  pushText(line.slice(last));
  return out;
}

const LIST_RE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/;

/**
 * Texto -> blocos. Suporta parágrafos (linha em branco), quebras de linha, listas ("- ", "• ", "1."),
 * **negrito**, [rótulo](url) e URLs https/mailto soltas. Nada além disso.
 * @returns {Array<{type:'p', inline:object[]}|{type:'ul', items:object[][]}>}
 */
export function parseSafeText(text, opts = {}) {
  const lines = cleanText(text).split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (!para.length) return;
    const inline = [];
    para.forEach((l, i) => {
      if (i > 0) inline.push({ t: "br" });
      inline.push(...parseInline(l, opts));
    });
    blocks.push({ type: "p", inline });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "ul", items: list });
    list = null;
  };
  for (const line of lines) {
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const li = line.match(LIST_RE);
    if (li) {
      flushPara();
      if (!list) list = [];
      list.push(parseInline(li[1], opts));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** Texto puro (sem marcação), por exemplo para rótulos de leitor de tela. */
export function plainText(text, opts = {}) {
  return parseSafeText(text, opts)
    .map((b) => (b.type === "p"
      ? b.inline.map((n) => (n.t === "br" ? " " : n.v)).join("")
      : b.items.map((it) => it.map((n) => n.v ?? "").join("")).join("; ")))
    .join(" ");
}
