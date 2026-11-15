// Comportamento de acessibilidade para diálogos modais (mixin para Options API):
// foco inicial, retorno do foco ao fechar, ESC para fechar e foco preso dentro do diálogo.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root) {
  if (!root || !root.querySelectorAll) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

// Estado por instância fora da reatividade do Vue (evita proxies em elementos do DOM).
const states = new WeakMap();
// Pilha de diálogos abertos: só o do topo reage a ESC/Tab.
const stack = [];

export const dialogA11y = {
  methods: {
    // root: elemento do diálogo; onEscape: função chamada ao pressionar ESC.
    activateDialog(root, onEscape) {
      this.deactivateDialog(false);
      if (typeof document === "undefined" || !root) return;

      const previous = document.activeElement;
      const owner = this.$;
      const onKeydown = (event) => {
        if (stack[stack.length - 1] !== owner) return;
        if (event.key === "Escape") {
          event.stopPropagation();
          if (onEscape) onEscape();
          return;
        }
        if (event.key !== "Tab") return;
        const items = focusableIn(root);
        if (!items.length) {
          event.preventDefault();
          root.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener("keydown", onKeydown, true);
      states.set(this.$, { previous, onKeydown });
      stack.push(owner);

      const items = focusableIn(root);
      // Prefere o primeiro campo de formulário; senão o primeiro elemento focável.
      const target = items.find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) || items[0] || root;
      if (target && target.focus) target.focus();
    },
    deactivateDialog(restoreFocus = true) {
      const state = states.get(this.$);
      if (!state) return;
      document.removeEventListener("keydown", state.onKeydown, true);
      states.delete(this.$);
      const at = stack.indexOf(this.$);
      if (at >= 0) stack.splice(at, 1);
      if (restoreFocus && state.previous && state.previous.focus && document.contains(state.previous)) {
        state.previous.focus();
      }
    },
  },
  beforeUnmount() {
    this.deactivateDialog();
  },
};
