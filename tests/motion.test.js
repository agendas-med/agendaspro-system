import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Sistema de movimento (assets/css/motion.css). Os testes leem os arquivos como texto:
// o projeto testa utilitários puros, sem montar componentes.
const root = join(__dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const motion = read("assets/css/motion.css");

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const sources = ["assets/css", "components", "pages", "layouts"]
  .flatMap((d) => walk(join(root, d), [".vue", ".css"]))
  .map((f) => ({ file: relative(root, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

describe("motion.css: registro e tokens", () => {
  it("esta registrado no nuxt.config depois do ui.css", () => {
    const cfg = read("nuxt.config.ts");
    expect(cfg).toContain("~/assets/css/motion.css");
    expect(cfg.indexOf("'~/assets/css/ui.css'")).toBeLessThan(cfg.indexOf("'~/assets/css/motion.css'"));
  });

  it("define tokens de duracao, curva e deslocamento", () => {
    for (const t of [
      "--motion-instant: 90ms", "--motion-fast: 150ms", "--motion-base: 220ms", "--motion-slow: 320ms",
      "--ease-standard", "--ease-out", "--ease-in", "--ease-spring", "--motion-shift: 8px", "--motion-scale: 0.97"
    ]) {
      expect(motion, t).toContain(t);
    }
  });

  it("define os keyframes e utilitarios do contrato", () => {
    for (const k of ["m-fade-in", "m-fade-up", "m-scale-in", "m-slide-in-right", "m-shimmer", "m-pulse-soft", "m-shake", "m-check-pop"]) {
      expect(motion, k).toMatch(new RegExp(`@keyframes ${k}\\b`));
    }
    for (const c of [".m-press", ".m-lift", ".m-fade-up", ".m-stagger", ".skeleton", ".m-shake"]) {
      expect(motion, c).toContain(c);
    }
  });

  it("define as transicoes de Vue padrao", () => {
    for (const n of ["fade", "modal", "slide-right", "list", "tab-swap", "expand", "toast"]) {
      expect(motion, n).toContain(`.${n}-enter-active`);
    }
  });

  it("nenhuma duracao fixa passa de 320ms", () => {
    expect(motion).not.toMatch(/--motion-[a-z]+:\s*(3[3-9]\d|[4-9]\d\d|\d{4,})ms/);
  });
});

describe("prefers-reduced-motion", () => {
  it("tem o bloco e neutraliza animacao e transicao", () => {
    const i = motion.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(i).toBeGreaterThan(-1);
    const block = motion.slice(i);
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toContain(".skeleton");
  });
});

describe("regras de CSS em todo o painel", () => {
  it("nao usa transition: all", () => {
    const hits = sources.filter((s) => /transition:\s*all\b/.test(s.text) || /transition-property:\s*all\b/.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it("nao anima propriedades de layout (exceto width de barra e max-height de acordeao)", () => {
    const allowed = new Set(["components/Utils/OpeningScheduled.vue", "assets/css/motion.css"]);
    const hits = [];
    for (const s of sources) {
      if (allowed.has(s.file)) continue;
      const re = /transition(?:-property)?:\s*([^;]+);/g;
      let m;
      while ((m = re.exec(s.text))) {
        if (/\b(height|top|left|right|bottom|margin|padding)\b/.test(m[1].replace(/max-height/g, "")) && !/(border-|line-)/.test(m[1])) hits.push(s.file + ": " + m[1].trim());
      }
    }
    expect(hits).toEqual([]);
  });

  it("nenhuma transicao literal passa de 320ms", () => {
    const hits = [];
    for (const s of sources) {
      const re = /transition(?:-duration)?:\s*([^;]+);/g;
      let m;
      while ((m = re.exec(s.text))) {
        for (const d of m[1].matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
          const ms = d[2] === "s" ? parseFloat(d[1]) * 1000 : parseFloat(d[1]);
          if (ms > 320) hits.push(s.file + ": " + m[1].trim());
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("animacoes infinitas so em spinner, skeleton e pulse-soft", () => {
    const hits = [];
    for (const s of sources) {
      for (const m of s.text.matchAll(/animation:\s*([^;]*\binfinite\b[^;]*);/g)) {
        if (!/(spin|rotate|dash|m-shimmer|m-pulse-soft)/.test(m[1])) hits.push(s.file + ": " + m[1].trim());
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("componentes usam as transicoes padrao", () => {
  const has = (file, re) => expect(read(file), file).toMatch(re);

  it("modais", () => {
    for (const f of ["components/Utils/Modal.vue", "components/Utils/FeedbackModal.vue", "components/Utils/ConfirmDialog.vue",
      "components/Utils/UpgradeModal.vue", "components/GoogleCalendar/DisconnectDialog.vue"]) {
      has(f, /<Transition name="modal">/);
      has(f, /m-panel/);
    }
  });

  it("toast, dropdowns e listas", () => {
    has("components/Utils/Toast.vue", /<TransitionGroup name="toast"/);
    has("components/Header/User.vue", /<transition name="dropdown">/);
    has("components/Utils/UtilsMultiselect.vue", /<Transition name="dropdown">/);
    has("components/Utils/ajaxAutocomplete.vue", /<Transition name="dropdown">/);
  });

  it("paginas filhas trocam com tab-swap e o Nuxt usa page/layout", () => {
    for (const f of ["assistente", "billing", "configuracoes", "financeiro", "integracoes", "profissionais", "whatsapp"]) {
      has(`pages/${f}.vue`, /name: 'tab-swap'/);
    }
    const cfg = read("nuxt.config.ts");
    expect(cfg).toMatch(/pageTransition:\s*\{\s*name:\s*'page'/);
    expect(cfg).toMatch(/layoutTransition:\s*\{\s*name:\s*'layout'/);
  });

  it("barras, tabela e mensagens usam utilitarios de movimento", () => {
    has("components/Assistant/UsageMeter.vue", /m-bar-fill/);
    has("components/Whatsapp/UsageCard.vue", /m-bar-fill/);
    has("components/Instagram/Funnel.vue", /m-bar-fill/);
    has("components/Utils/DataTable.vue", /m-fade-up m-stagger/);
    has("components/Assistant/ChatPanel.vue", /msg m-fade-up/);
    has("components/Whatsapp/Thread.vue", /msg m-fade-up/);
    has("components/Assistant/ActionCard.vue", /m-check-pop/);
    has("components/Integrations/Block.vue", /class="skeleton"/);
  });

  it("badge do menu pulsa so quando renderizado (contagem > 0) e mantem as classes dos testes", () => {
    const nav = read("components/Sidebar/Nav.vue");
    expect(nav).toMatch(/nav-badge[^"]*m-pulse-soft|m-pulse-soft[^"]*nav-badge/);
  });
});
