<template>
    <figure class="chart">
        <figcaption class="fontsize-sm cinza">{{ name }}</figcaption>
        <p class="fontsize-sm cinza" v-if="!series">Sem dados no período.</p>
        <template v-else>
            <svg :viewBox="'0 0 ' + width + ' ' + height" role="img" :aria-label="description" preserveAspectRatio="none">
                <path :d="series.area" class="area" v-if="series.area" />
                <path :d="series.path" class="line" />
                <circle v-for="dot in series.dots" :key="dot.x" :cx="dot.x" :cy="dot.y" r="3" class="dot" />
            </svg>
            <div class="axis fontsize-sm cinza">
                <span>{{ series.firstLabel }}</span>
                <strong class="preto">{{ format(series.last) }}</strong>
                <span>{{ series.lastLabel }}</span>
            </div>
            <p class="fontsize-sm" :class="series.delta >= 0 ? 'verde-escuro' : 'vermelho'" v-if="series.count > 1">
                {{ series.delta >= 0 ? "▲" : "▼" }} {{ deltaText }}
            </p>
        </template>
    </figure>
</template>

<script>
import { buildSeries, describeSeries } from '../../utils/series.js';
import { formatCount } from '../../utils/instagram.js';

// Gráfico de linha leve em SVG (sem biblioteca). Valores ausentes quebram a linha. O texto alternativo resume a série.
export default {
    props: {
        name: { type: String, required: true },
        points: { type: Array, default: () => [] },
        format: { type: Function, default: formatCount }
    },
    data() {
        return { width: 240, height: 72 };
    },
    computed: {
        series() {
            return buildSeries(this.points, { width: this.width, height: this.height });
        },
        description() {
            return describeSeries(this.name, this.series, this.format);
        },
        deltaText() {
            const s = this.series;
            const pct = s.deltaPct === null ? "" : " (" + (Math.abs(s.deltaPct) * 100).toFixed(1).replace(".", ",") + "%)";
            return this.format(Math.abs(s.delta)) + pct + " no período";
        }
    }
}
</script>

<style scoped>
.chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
}

svg {
    width: 100%;
    height: 72px;
    overflow: visible;
}

.line {
    fill: none;
    stroke: var(--azul);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
}

.area {
    fill: var(--azul-claro);
    opacity: 0.5;
}

.dot {
    fill: var(--azul);
}

.axis {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}
</style>
