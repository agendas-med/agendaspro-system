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
        <p class="fontsize-sm cinza" v-else-if="plan && plan.monthlyLimit != null">
            Seu plano inclui {{ plan.monthlyLimit }} interações do assistente por mês. O uso aparece depois da primeira mensagem.
        </p>
        <p class="fontsize-sm cinza" v-else>O uso do mês aparece depois da primeira mensagem.</p>

        <p class="fontsize-sm cinza" v-if="plan && plan.actionsEnabled === false">
            <font-awesome icon="lock" aria-hidden="true" /> Plano somente para consultas: o assistente responde perguntas, mas não executa ações.
        </p>
    </div>
</template>

<script>
export default {
    props: {
        usage: { type: Object, default: null },
        plan: { type: Object, default: null }
    },
    computed: {
        planName() {
            return this.plan && this.plan.planName ? this.plan.planName : "";
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
    border-radius: var(--radius-full);
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
