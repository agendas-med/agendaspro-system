<template>
    <IntegrationsBlock id="ig-funnel" title="Conversão: do Instagram ao agendamento" :block="block" :empty="false" v-on:retry="$emit('retry')"
        locked-title="Conversão no plano Premium"
        locked-text="Veja quantos cliques e visitas do Instagram viram agendamentos e quanto isso representa em receita estimada.">
        <p class="fontsize-md cinza" v-if="conversion && empty">
            Ainda não há visitas vindas do Instagram neste período. Use os links com UTM abaixo (na bio, em posts e stories) para que
            cada visita e cada agendamento sejam atribuídos ao Instagram.
        </p>
        <template v-else-if="conversion && !empty">
            <ol class="steps">
                <li v-for="step in steps" :key="step.key">
                    <div class="row fontsize-md">
                        <span class="preto">{{ step.label }}</span>
                        <strong class="preto">{{ count(step.value) }}</strong>
                    </div>
                    <div class="bar" aria-hidden="true"><span :style="{ width: step.pct + '%' }"></span></div>
                    <p class="fontsize-sm cinza" v-if="step.rate !== null">{{ rate(step.rate) }} da etapa anterior</p>
                </li>
            </ol>
            <div class="int-grid">
                <div class="int-stat">
                    <span class="fontsize-sm cinza">Visita para agendamento</span>
                    <strong>{{ rate(conversion.totals.visitToBooking) }}</strong>
                </div>
                <div class="int-stat">
                    <span class="fontsize-sm cinza">Receita estimada</span>
                    <strong>{{ money(conversion.totals.revenueEstimatedCents) }}</strong>
                    <span class="fontsize-sm cinza">soma dos serviços agendados</span>
                </div>
                <div class="int-stat">
                    <span class="fontsize-sm cinza">Receita paga</span>
                    <strong>{{ money(conversion.totals.revenuePaidCents) }}</strong>
                    <span class="fontsize-sm cinza">pagamentos já confirmados</span>
                </div>
            </div>
            <template v-if="conversion.byCampaign.length">
                <h3 class="fontsize-md-bold preto">Por campanha</h3>
                <table class="campaigns fontsize-md">
                    <thead><tr><th scope="col">Campanha</th><th scope="col">Visitas</th><th scope="col">Agendamentos</th><th scope="col">Receita estimada</th></tr></thead>
                    <tbody>
                        <tr v-for="c in conversion.byCampaign" :key="c.campaign">
                            <th scope="row">{{ c.campaign }}</th>
                            <td>{{ count(c.visits) }}</td>
                            <td>{{ count(c.bookings) }}</td>
                            <td>{{ money(c.revenueEstimatedCents) }}</td>
                        </tr>
                    </tbody>
                </table>
            </template>
        </template>
    </IntegrationsBlock>
</template>

<script>
import { formatCount, formatRate, funnelSteps, conversionIsEmpty } from '../../utils/instagram.js';
import { formatCents } from '../../utils/money.js';

export default {
    props: {
        conversion: { type: Object, default: null },
        block: { type: Object, required: true }
    },
    emits: ['retry'],
    computed: {
        steps() { return this.conversion ? funnelSteps(this.conversion.totals) : []; },
        empty() { return conversionIsEmpty(this.conversion); }
    },
    methods: {
        count: formatCount,
        rate: formatRate,
        money: formatCents
    }
}
</script>

<style scoped>
.steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
}

.bar {
    height: 10px;
    border-radius: var(--radius-full);
    background: var(--cinza-claro);
    overflow: hidden;
    margin: var(--space-2) 0;
}

.bar span {
    display: block;
    height: 100%;
    background: var(--azul);
}

.campaigns {
    border-collapse: collapse;
    width: 100%;
}

.campaigns th,
.campaigns td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--cinza-medio);
}
</style>
