<template>
    <IntegrationsBlock id="ig-insights" title="Métricas" :block="block" :empty="block.status === 'ready' && !insights"
        empty-text="O Instagram ainda não devolveu métricas para esta conta." v-on:retry="$emit('retry')"
        locked-title="Métricas e histórico no plano Premium"
        locked-text="Acompanhe alcance, visualizações, salvamentos, compartilhamentos e cliques nos links do perfil, com histórico em gráficos e comparação entre posts.">
        <template #actions>
            <div class="period" role="group" aria-label="Período das métricas" v-if="premium">
                <button type="button" class="btn btn-cinza btn-auto" v-for="d in periods" :key="d"
                    :aria-pressed="days === d ? 'true' : 'false'" :class="{ active: days === d }"
                    v-on:click="$emit('period', d)">{{ d }} dias</button>
            </div>
        </template>

        <template v-if="insights">
            <p class="fontsize-sm cinza" v-if="insights.stale" role="status">Mostrando os últimos dados salvos: o Instagram limitou as consultas por enquanto.</p>
            <ul class="int-grid cards">
                <li class="int-stat" v-for="card in cards" :key="card.key">
                    <span class="fontsize-sm cinza">{{ card.label }}</span>
                    <strong>{{ count(card.value) }}</strong>
                    <span class="fontsize-sm cinza">{{ card.hint }}</span>
                </li>
            </ul>
            <p class="fontsize-sm cinza">
                Visitas ao perfil ainda não são fornecidas pelo Instagram para esta integração. Os cliques nos links do perfil e as visitas
                à sua página de agendamento (veja a conversão abaixo) mostram o interesse gerado.
            </p>

            <h3 class="fontsize-md-bold preto">Histórico</h3>
            <p class="fontsize-md cinza" v-if="!hasHistory">
                O histórico começa a ser montado a partir da conexão: volte em alguns dias para ver a evolução.
            </p>
            <div class="charts" v-else>
                <IntegrationsLineChart v-for="m in metrics" :key="m.key" :name="m.label" :points="points(m.key)" />
            </div>

            <template v-if="insights.top.length || insights.byType.length">
                <h3 class="fontsize-md-bold preto">Comparação entre posts</h3>
                <div class="compare">
                    <div v-if="insights.top.length">
                        <h4 class="fontsize-md preto">Maior engajamento</h4>
                        <ul class="ranking">
                            <li v-for="p in insights.top" :key="p.id" class="fontsize-md">
                                <a :href="p.permalink" target="_blank" rel="noopener noreferrer" v-if="p.permalink">{{ p.caption || typeLabel(p.type) }}</a>
                                <span v-else>{{ p.caption || typeLabel(p.type) }}</span>
                                <span class="cinza"> · {{ rate(p.engagementRate) }}</span>
                            </li>
                        </ul>
                    </div>
                    <div v-if="insights.bottom.length">
                        <h4 class="fontsize-md preto">Menor engajamento</h4>
                        <ul class="ranking">
                            <li v-for="p in insights.bottom" :key="p.id" class="fontsize-md">
                                <a :href="p.permalink" target="_blank" rel="noopener noreferrer" v-if="p.permalink">{{ p.caption || typeLabel(p.type) }}</a>
                                <span v-else>{{ p.caption || typeLabel(p.type) }}</span>
                                <span class="cinza"> · {{ rate(p.engagementRate) }}</span>
                            </li>
                        </ul>
                    </div>
                    <div v-if="insights.byType.length">
                        <h4 class="fontsize-md preto">Por formato</h4>
                        <table class="by-type fontsize-md">
                            <thead><tr><th scope="col">Formato</th><th scope="col">Posts</th><th scope="col">Média de interações</th><th scope="col">Engajamento</th></tr></thead>
                            <tbody>
                                <tr v-for="t in insights.byType" :key="t.type">
                                    <th scope="row">{{ typeLabel(t.type) }}</th>
                                    <td>{{ t.posts }}</td>
                                    <td>{{ count(t.avg) }}</td>
                                    <td>{{ rate(t.rate) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>
        </template>
    </IntegrationsBlock>
</template>

<script>
import { formatCount, formatRate, insightCards, mediaTypeLabel, HISTORY_METRICS } from '../../utils/instagram.js';
import { historyPoints } from '../../utils/series.js';

export default {
    props: {
        insights: { type: Object, default: null },
        block: { type: Object, required: true },
        premium: { type: Boolean, default: false },
        days: { type: Number, default: 30 }
    },
    emits: ['retry', 'period'],
    data() {
        return { periods: [7, 30, 90] };
    },
    computed: {
        cards() { return insightCards(this.insights); },
        metrics() { return HISTORY_METRICS; },
        hasHistory() { return !!this.insights && this.insights.history.length > 1; }
    },
    methods: {
        count: formatCount,
        rate: formatRate,
        typeLabel: mediaTypeLabel,
        points(field) { return historyPoints(this.insights ? this.insights.history : [], field); }
    }
}
</script>

<style scoped>
.cards {
    list-style: none;
    margin: 0;
    padding: 0;
}

.charts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-6);
}

.period {
    display: flex;
    gap: var(--space-2);
}

.period .active {
    background: var(--azul);
    color: var(--branco);
}

.compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-6);
}

.ranking {
    margin: var(--space-3) 0 0;
    padding-left: var(--space-5);
    overflow-wrap: anywhere;
}

.by-type {
    border-collapse: collapse;
    width: 100%;
}

.by-type th,
.by-type td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--cinza-medio);
}
</style>
