<template>
    <IntegrationsBlock id="gc-blocks" title="Horários ocupados importados" :block="state.blocks.block" :empty="!state.blocks.items.length"
        empty-text="Nenhum horário ocupado importado do Google nos próximos 90 dias." v-on:retry="$googleCalendar.loadBlocks()">
        <p class="fontsize-md cinza">{{ note }}</p>
        <ul class="list">
            <li v-for="b in state.blocks.items" :key="b.id" class="fontsize-md">
                <strong class="preto">{{ range(b) }}</strong>
                <span class="cinza"> · {{ who(b) }}</span>
                <span class="tag" aria-label="Importado do Google Agenda, somente leitura">Google</span>
            </li>
        </ul>
    </IntegrationsBlock>
</template>

<script>
import { GOOGLE_BLOCK_NOTE } from '../../utils/googleCalendar.js';
import { formatDateTime } from '../../utils/integrations.js';

// Lista somente leitura dos bloqueios importados do Google (não podem ser apagados no AgendasPRO).
export default {
    computed: {
        state() { return this.$googleCalendar.state; },
        note() { return GOOGLE_BLOCK_NOTE; }
    },
    methods: {
        range(b) {
            const start = formatDateTime(b.startsAt) || b.startsAt;
            const end = formatDateTime(b.endsAt) || b.endsAt;
            return end ? `${start} até ${end}` : start;
        },
        who(b) {
            if (!b.professionalId) return 'Toda a empresa';
            const p = this.state.professionals.find((x) => String(x.id) === b.professionalId);
            return p && p.name ? p.name : `Profissional #${b.professionalId}`;
        }
    }
}
</script>

<style scoped>
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.list li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
}
</style>
