<template>
    <div class="dlg-overlay" v-if="open">
        <div class="dlg-wrapper" v-on:click="cancel()"></div>
        <div class="dlg" ref="dialog" role="alertdialog" aria-modal="true" aria-labelledby="gc-dc-title"
            aria-describedby="gc-dc-message" tabindex="-1">
            <div class="dlg-body">
                <h2 class="fontsize-lg-bold preto" id="gc-dc-title">Desconectar o Google Agenda?</h2>
                <div id="gc-dc-message" class="dlg-message">
                    <p class="fontsize-md cinza" v-for="line in lines" :key="line">{{ line }}</p>
                </div>
                <div class="input-checkbox-group" v-if="hasAppCalendar">
                    <input type="checkbox" id="gc-dc-remove" v-model="removeAppCalendars" />
                    <label for="gc-dc-remove">Apagar também o calendário criado pelo AgendasPRO no Google (remove os eventos exportados)</label>
                </div>
            </div>
            <div class="dlg-footer">
                <button type="button" class="btn btn-cinza" v-on:click="cancel()">Cancelar</button>
                <button type="button" class="btn btn-red" v-on:click="confirm()">Desconectar</button>
            </div>
        </div>
    </div>
</template>

<script>
import { dialogA11y } from '../../utils/dialogA11y.js';
import { disconnectCopy } from '../../utils/googleCalendar.js';

// Confirmação de desconexão do Google. Funciona em qualquer plano; avisa que eventos exportados continuam no Google.
export default {
    mixins: [dialogA11y],
    props: {
        open: { type: Boolean, default: false },
        links: { type: Array, default: () => [] }
    },
    emits: ['cancel', 'confirm'],
    data() {
        return { removeAppCalendars: false };
    },
    computed: {
        hasAppCalendar() { return this.links.some((l) => l.createdByApp); },
        lines() { return disconnectCopy({ removeAppCalendars: this.removeAppCalendars && this.hasAppCalendar, links: this.links }); }
    },
    watch: {
        open(value) {
            if (value) {
                this.removeAppCalendars = false;
                this.$nextTick(() => {
                    this.activateDialog(this.$refs.dialog, () => this.cancel());
                    const cancel = this.$refs.dialog && this.$refs.dialog.querySelector('.btn-cinza');
                    if (cancel) cancel.focus();
                });
            } else {
                this.deactivateDialog();
            }
        }
    },
    methods: {
        cancel() { this.$emit('cancel'); },
        confirm() { this.$emit('confirm', { removeAppCalendars: this.removeAppCalendars && this.hasAppCalendar }); }
    }
}
</script>

<style scoped>
.dlg-overlay,
.dlg-wrapper {
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
}

.dlg-overlay {
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
}

.dlg-wrapper {
    background-color: rgba(0, 0, 0, 0.6);
}

.dlg {
    position: relative;
    z-index: 31;
    width: 90vw;
    max-width: 460px;
    max-height: 90vh;
    overflow: auto;
    background: white;
    border-radius: var(--radius-lg);
    border: 1px solid var(--cinza-medio);
}

.dlg-body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.dlg-footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.dlg-footer .btn {
    max-width: none;
}
</style>
