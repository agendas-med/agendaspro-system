<template>
    <section class="wa-card" aria-labelledby="wa-status-title">
        <header class="wa-card-header">
            <h2 class="fontsize-md-bold preto" id="wa-status-title">Número do WhatsApp</h2>
            <span class="tag" :class="status.enabled ? 'green' : 'red'" role="status">
                {{ status.enabled ? "Conectado" : "Desconectado" }}
            </span>
        </header>

        <p class="fontsize-md cinza" v-if="!status.enabled">
            O WhatsApp da plataforma está desligado no momento. Seus clientes não conseguem conversar por ele até a
            conexão ser restabelecida. Nenhuma ação é necessária da sua parte.
        </p>

        <template v-else>
            <p class="fontsize-md cinza">
                Seus clientes conversam com o assistente pelo número da plataforma:
                <strong class="preto">{{ status.displayPhone || "número não informado" }}</strong>
            </p>

            <div class="wa-link" v-if="status.waLink">
                <div class="input-group">
                    <label for="wa-link-input">Link para divulgar (abre a conversa já identificando sua empresa)</label>
                    <div class="wa-link-row">
                        <input id="wa-link-input" type="text" readonly :value="status.waLink" v-on:focus="$event.target.select()" />
                        <button type="button" class="btn btn-primary wa-copy" v-on:click="copy()">
                            <font-awesome icon="copy" aria-hidden="true" /> {{ copied ? "Copiado!" : "Copiar link" }}
                        </button>
                    </div>
                </div>
                <p class="sr-only" role="status" aria-live="polite">{{ copied ? "Link copiado." : "" }}</p>
                <p class="fontsize-sm cinza" v-if="copyFailed" role="alert">
                    Não foi possível copiar automaticamente. Selecione o link acima e copie manualmente.
                </p>
                <WhatsappQrCode :text="status.waLink" />
            </div>
            <p class="fontsize-md cinza" v-else>
                O link de divulgação ainda não está disponível: a empresa precisa ter um identificador (slug) cadastrado.
            </p>

            <div class="wa-notice" role="status" v-if="!status.bookingReady">
                A página pública de agendamento da sua empresa está desativada, então o bot não consegue concluir
                agendamentos pelo WhatsApp. Ative a página pública para liberar essa função.
            </div>
        </template>
    </section>
</template>

<script>
import { copyText } from '../../utils/clipboard.js';

export default {
    props: {
        status: { type: Object, required: true }
    },
    data() {
        return { copied: false, copyFailed: false, timer: null };
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    },
    methods: {
        async copy() {
            const ok = await copyText(this.status.waLink);
            this.copied = ok;
            this.copyFailed = !ok;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => { this.copied = false; }, 3000);
        }
    }
}
</script>

<style scoped>
.wa-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
}

.wa-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
}

.wa-link {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.wa-link-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
}

.wa-link-row input {
    flex: 1 1 260px;
    min-width: 0;
}

.wa-copy {
    width: auto;
    max-width: none;
}

.wa-notice {
    padding: var(--space-5);
    border: 1px solid var(--amarelo);
    background: var(--amarelo-claro);
    border-radius: var(--radius-md);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}
</style>
