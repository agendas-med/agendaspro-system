<template>
    <IntegrationsBlock id="ig-engagement" title="Engajamento" :block="block" :empty="!engagement || !engagement.postsConsidered"
        empty-text="Ainda não há publicações suficientes para calcular o engajamento." v-on:retry="$emit('retry')">
        <div class="int-grid" v-if="engagement">
            <div class="int-stat">
                <span class="fontsize-sm cinza">Taxa de engajamento</span>
                <strong>{{ rate(engagement.rate) }}</strong>
                <span class="fontsize-sm cinza" v-if="basis">{{ basis }}</span>
            </div>
            <div class="int-stat">
                <span class="fontsize-sm cinza">Interações nos últimos posts</span>
                <strong>{{ count(engagement.interactions) }}</strong>
                <span class="fontsize-sm cinza">{{ engagement.postsConsidered }} publicações consideradas</span>
            </div>
            <div class="int-stat">
                <span class="fontsize-sm cinza">Média por post</span>
                <strong>{{ count(engagement.avgInteractions) }}</strong>
            </div>
        </div>
        <details class="formula">
            <summary class="fontsize-md">Como o engajamento é calculado</summary>
            <p class="fontsize-md cinza">{{ formula }}</p>
        </details>
    </IntegrationsBlock>
</template>

<script>
import { formatCount, formatRate, engagementBasisLabel, ENGAGEMENT_FORMULA } from '../../utils/instagram.js';

export default {
    props: {
        engagement: { type: Object, default: null },
        block: { type: Object, default: () => ({ status: 'ready' }) }
    },
    emits: ['retry'],
    computed: {
        basis() { return this.engagement ? engagementBasisLabel(this.engagement.basis) : ''; },
        formula() { return ENGAGEMENT_FORMULA; }
    },
    methods: { count: formatCount, rate: formatRate }
}
</script>

<style scoped>
.formula summary {
    cursor: pointer;
}
</style>
