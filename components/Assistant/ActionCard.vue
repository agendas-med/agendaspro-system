<template>
    <article class="action-card" :class="'is-' + action.state" :aria-label="'Ação proposta: ' + title">
        <header class="action-head">
            <p class="action-kicker fontsize-sm cinza">Ação proposta pelo assistente</p>
            <div class="action-tags">
                <span class="tag fontsize-sm" :class="tone">{{ risk }}</span>
                <span class="tag fontsize-sm" :class="stateTone" v-if="stateText" role="status">{{ stateText }}</span>
            </div>
        </header>

        <h3 class="action-title fontsize-md">{{ title }}</h3>
        <p class="action-summary" v-if="action.summary">{{ action.summary }}</p>

        <dl class="action-rows" v-if="rows.length">
            <div v-for="row in rows" :key="row.key" class="action-row">
                <dt class="fontsize-sm cinza">{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
            </div>
        </dl>

        <p class="fontsize-sm cinza" v-if="isOpen && countdown">
            <font-awesome icon="clock" aria-hidden="true" /> {{ countdown }}
        </p>

        <div class="action-result" v-if="action.state === 'executed' && action.result" role="status">
            <p><font-awesome icon="circle-check" aria-hidden="true" /> <strong>Ação executada.</strong></p>
            <p v-if="action.result.summary">{{ action.result.summary }}</p>
            <dl class="action-rows" v-if="action.result.rows.length">
                <div v-for="row in action.result.rows" :key="row.key" class="action-row">
                    <dt class="fontsize-sm cinza">{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                </div>
            </dl>
        </div>

        <p class="action-note fontsize-sm" v-if="needsToken" role="note">
            Esta ação vem do histórico. Para confirmá-la, prepare a confirmação: isso só gera uma nova autorização, nada é executado até você clicar em Confirmar.
        </p>
        <p class="action-note fontsize-sm" v-else-if="isOpen && expired" role="note">
            O prazo para confirmar acabou. Peça novamente ao assistente.
        </p>

        <p class="action-error fontsize-sm" v-if="action.error && action.state !== 'executed'" role="alert">{{ action.error }}</p>

        <div class="action-buttons" v-if="isOpen">
            <template v-if="action.state === 'unknown'">
                <button type="button" class="btn btn-primary" v-on:click="$emit('verify', action.actionId)">Verificar situação</button>
            </template>
            <template v-else-if="needsToken || action.state === 'reissuing'">
                <button type="button" class="btn btn-primary" :class="{ 'btn-loading': action.state === 'reissuing' }"
                    :disabled="busy || expired" v-on:click="$emit('reissue', action.actionId)">
                    Preparar confirmação
                </button>
                <button type="button" class="btn btn-cinza" :disabled="busy" v-on:click="$emit('reject', action.actionId)">
                    Rejeitar
                </button>
            </template>
            <template v-else>
                <button type="button" class="btn btn-primary" :class="{ 'btn-loading': action.state === 'confirming' }"
                    :disabled="!canConfirm" v-on:click="$emit('confirm', action.actionId)">
                    Confirmar
                </button>
                <button type="button" class="btn btn-cinza" :class="{ 'btn-loading': action.state === 'rejecting' }"
                    :disabled="busy" v-on:click="$emit('reject', action.actionId)">
                    Rejeitar
                </button>
            </template>
        </div>

        <NuxtLink to="/billing/plano" class="btn btn-primary action-cta" v-if="action.upgrade && isAdmin">Ver planos e fazer upgrade</NuxtLink>
        <p class="fontsize-sm cinza" v-else-if="action.upgrade">Peça ao administrador da empresa para mudar de plano.</p>
    </article>
</template>

<script>
import { toolLabel, riskLabel, riskTone, previewRows, actionStateLabel, formatCountdown, isExpired } from '../../utils/assistant.js';

// Nada é executado aqui: os botões só emitem eventos; quem chama o core é o controlador, e só após o clique.
// Todo texto (resumo e parâmetros vêm do core/IA) é interpolado, nunca HTML.
export default {
    props: {
        action: { type: Object, required: true }
    },
    emits: ["confirm", "reject", "verify", "reissue"],
    data() {
        return { now: Date.now(), timer: null };
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        },
        title() { return toolLabel(this.action.tool); },
        risk() { return riskLabel(this.action.risk); },
        tone() { return riskTone(this.action.risk); },
        rows() { return previewRows(this.action.paramsPreview); },
        stateText() {
            const s = this.action.state;
            return s === "pending" ? "" : actionStateLabel(s);
        },
        stateTone() {
            const s = this.action.state;
            if (s === "executed") return "green";
            if (s === "failed" || s === "denied") return "red";
            if (s === "expired" || s === "unknown") return "yellow";
            return "";
        },
        // pending/unknown/reissuing/confirming/rejecting: ainda aberta (não terminou).
        isOpen() {
            return ["pending", "unknown", "reissuing", "confirming", "rejecting"].includes(this.action.state);
        },
        busy() {
            return ["reissuing", "confirming", "rejecting"].includes(this.action.state);
        },
        // Proposta do histórico: sem token em memória. Gerar um novo é um clique explícito (nunca automático).
        needsToken() {
            return this.action.state === "pending" && !this.action.token && !this.expired;
        },
        expired() {
            return isExpired(this.action.expiresAt, this.now);
        },
        canConfirm() {
            return this.action.state === "pending" && !!this.action.token && !this.expired;
        },
        countdown() {
            if (this.action.expiresAt == null || this.expired) return "";
            return "Expira em " + formatCountdown(this.action.expiresAt, this.now);
        }
    },
    mounted() {
        this.timer = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    beforeUnmount() {
        if (this.timer) clearInterval(this.timer);
    }
}
</script>

<style scoped>
.action-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 2px solid var(--amarelo);
    border-radius: var(--radius-md);
    background: var(--branco);
    max-width: 640px;
}

.action-card.is-executed {
    border-color: var(--verde-escuro);
}

.action-card.is-failed,
.action-card.is-denied {
    border-color: var(--vermelho);
}

.action-card.is-rejected,
.action-card.is-expired,
.action-card.is-processed,
.action-card.is-gone {
    border-color: var(--cinza-medio);
}

.action-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-3);
}

.action-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}

.action-title {
    font-weight: 700;
}

.action-summary {
    overflow-wrap: anywhere;
}

.action-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.action-row {
    display: grid;
    grid-template-columns: minmax(90px, 160px) 1fr;
    gap: var(--space-3);
}

.action-row dd {
    overflow-wrap: anywhere;
}

.action-result {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.action-note,
.action-error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--amarelo-claro);
}

.action-error {
    color: var(--vermelho);
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.action-buttons .btn,
.action-cta {
    width: auto;
    max-width: none;
}
@media (max-width: 640px) {
    .action-row {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
    }

    .action-buttons .btn {
        flex: 1 1 140px;
    }
}
</style>
