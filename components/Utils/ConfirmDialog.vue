<template>
  <Transition name="modal">
    <div class="confirm-overlay flex items-center justify-center" v-if="$global.confirmDialog.show">
        <div class="confirm-wrapper" v-on:click="answer(false)"></div>
        <div class="confirm-container m-panel" ref="dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="confirm-title" aria-describedby="confirm-message" tabindex="-1">
            <div class="confirm-body">
                <h2 class="fontsize-lg-bold preto" id="confirm-title">{{ $global.confirmDialog.title }}</h2>
                <p class="fontsize-md cinza mt-2 confirm-message" id="confirm-message">{{ $global.confirmDialog.message }}</p>
            </div>
            <div class="confirm-footer">
                <button type="button" class="btn btn-cinza" v-on:click="answer(false)">{{ $global.confirmDialog.cancelLabel }}</button>
                <button type="button" class="btn" :class="$global.confirmDialog.danger ? 'btn-red' : 'btn-primary'"
                    v-on:click="answer(true)">{{ $global.confirmDialog.confirmLabel }}</button>
            </div>
        </div>
    </div>
  </Transition>
</template>

<script>
import { dialogA11y } from '../../utils/dialogA11y.js';

// Diálogo de confirmação único, montado em app.vue. Uso: await $myFunctions.confirmDialog({ title, message, danger })
export default {
    mixins: [dialogA11y],
    watch: {
        "$global.confirmDialog.show": function (show) {
            if (show) {
                this.$nextTick(() => {
                    this.activateDialog(this.$refs.dialog, () => this.answer(false));
                    // Foco inicial no botão seguro (cancelar).
                    const cancel = this.$refs.dialog && this.$refs.dialog.querySelector('.btn-cinza');
                    if (cancel) cancel.focus();
                });
            } else {
                this.deactivateDialog();
            }
        }
    },
    methods: {
        answer(value) {
            this.$myFunctions.answerConfirm(value);
        }
    }
}
</script>

<style scoped>
.confirm-overlay,
.confirm-wrapper {
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
}

.confirm-overlay {
    z-index: 30;
}

.confirm-wrapper {
    background-color: rgba(0, 0, 0, 0.6);
}

.confirm-container {
    position: relative;
    z-index: 31;
    width: 90vw;
    max-width: 420px;
    background: white;
    border-radius: var(--radius-lg);
    border: 1px solid var(--cinza-medio);
}

.confirm-body {
    padding: var(--space-5);
}

.confirm-message {
    white-space: pre-line;
}

.confirm-footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.confirm-footer .btn {
    max-width: none;
}
</style>
