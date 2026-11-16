<template>
    <div class="usage" role="group" aria-label="Uso mensal do assistente">
        <template v-if="usage && usage.known">
            <p class="fontsize-sm">
                <strong>{{ usage.used }}</strong> de <strong>{{ usage.limit }}</strong> interações usadas neste mês
                <span class="cinza" v-if="planName">(plano {{ planName }})</span>
            </p>
            <div class="usage-bar" role="progressbar" :aria-valuenow="usage.percent" aria-valuemin="0" aria-valuemax="100"
                :aria-label="usage.percent + '% da cota mensal usada'">
                <div class="usage-fill" :class="usage.tone" :style="{ width: usage.percent + '%' }"></div>
            </div>
            <p class="fontsize-sm usage-alert" role="status" v-if="usage.exhausted">
                A cota do mês acabou. O assistente volta a responder no próximo ciclo ou com um plano maior.
            </p>
            <p class="fontsize-sm usage-warn" role="status" v-else-if="usage.near">
                Restam {{ usage.remaining }} interações neste mês.
            </p>
        </template>
        <p class="fontsize-sm" v-else-if="usage && usage.unlimited">
            <strong>{{ usage.used }}</strong> interações neste mês, sem limite
            <span class="cinza" v-if="planName">(plano {{ planName }})</span>
        </p>
        <p class="fontsize-sm cinza" v-else>O uso do mês não está disponível agora.</p>

        <p class="fontsize-sm cinza" v-if="plan && plan.aiAvailable === false">
            <font-awesome icon="triangle-exclamation" aria-hidden="true" /> A IA está indisponível no momento: as respostas podem vir de um modo simplificado.
        </p>
        <p class="fontsize-sm cinza" v-if="actionsNote">
            <font-awesome icon="lock" aria-hidden="true" /> {{ actionsNote }}
        </p>
    </div>
</template>

<script>
import { actionsReasonLabel } from '../../utils/assistant.js';

// A cota vem de GET /assistant/status (já antes da primeira mensagem); todo texto é interpolado.
export default {
    props: {
        usage: { type: Object, default: null },
        plan: { type: Object, default: null }
    },
    computed: {
        planName() {
            return this.plan && this.plan.planName ? this.plan.planName : "";
        },
        // Só explica o bloqueio quando o status disse que as ações estão desativadas (e por quê).
        actionsNote() {
            if (!this.plan || this.plan.actionsEnabled !== false) return "";
            return actionsReasonLabel(this.plan.actionsReason);
        }
    }
}
</script>

<style scoped>
.usage {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.usage-bar {
    height: 8px;
    border-radius: var(--radius-xs);
    background: var(--cinza-medio);
    overflow: hidden;
}

.usage-fill {
    height: 100%;
    background: var(--verde-escuro);
    transition: width 0.3s;
}

.usage-fill.yellow {
    background: var(--amarelo);
}

.usage-fill.red {
    background: var(--vermelho);
}

.usage-alert {
    color: var(--vermelho);
}
</style>
