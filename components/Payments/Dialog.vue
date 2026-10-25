<template>
  <Teleport to="body">
    <div class="payment-overlay" @click.self="requestClose">
      <section
        ref="dialog"
        class="payment-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header>
          <div>
            <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
            <h2>{{ title }}</h2>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Fechar janela"
            :disabled="busy"
            @click="requestClose"
          >
            ×
          </button>
        </header>
        <div class="payment-dialog-body"><slot /></div>
        <footer v-if="$slots.footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<script>
export default {
  props: { title: String, eyebrow: String, busy: Boolean },
  emits: ["close"],
  mounted() {
    this.previousFocus = document.activeElement;
    this.$nextTick(() => this.$refs.dialog?.focus());
    document.addEventListener("keydown", this.onKeydown);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
    this.previousFocus?.focus?.();
  },
  methods: {
    requestClose() {
      if (!this.busy) this.$emit("close");
    },
    onKeydown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.requestClose();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...this.$refs.dialog.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === this.$refs.dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === this.$refs.dialog)
      ) {
        event.preventDefault();
        first.focus();
      }
    },
  },
};
</script>

<style scoped>
.payment-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #12251dc2;
  backdrop-filter: blur(4px);
}
.payment-dialog {
  width: min(100%, 560px);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  border: 1px solid #e3eae4;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 24px 90px #0b211b40;
  outline: none;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 26px 28px 22px;
  border-bottom: 1px solid #edf0ed;
}
h2 {
  font-size: 23px;
  line-height: 1.25;
  font-weight: 700;
  color: #172f25;
}
.eyebrow {
  margin-bottom: 5px;
  color: #558a48;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  text-transform: uppercase;
}
.close-button {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid #e4e9e4;
  font-size: 24px;
  color: #68766e;
  background: #f8faf8;
  cursor: pointer;
}
.payment-dialog-body {
  padding: 24px 28px;
  overflow-y: auto;
}
footer {
  padding: 18px 28px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #edf0ed;
  background: #fafcfa;
}
@media (max-width: 600px) {
  .payment-overlay {
    padding: 10px;
  }
  header,
  .payment-dialog-body {
    padding: 20px;
  }
  footer {
    padding: 16px 20px;
  }
  h2 {
    font-size: 21px;
  }
}
</style>
