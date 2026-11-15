<template>
    <section>
        <form class="period-filter" @submit.prevent="load()">
            <div class="input-group">
                <label for="period-from">De</label>
                <input type="date" id="period-from" v-model="period.from">
            </div>
            <div class="input-group">
                <label for="period-to">Até</label>
                <input type="date" id="period-to" v-model="period.to">
            </div>
            <button type="submit" class="btn btn-primary" :disabled="loading">Filtrar</button>
        </form>
        <p class="inline-error" role="alert" v-if="periodError">{{ periodError }}</p>

        <div class="totals" v-if="!loading && !loadError">
            <div>
                <p class="fontsize-sm cinza">Vendas liquidadas (bruto)</p>
                <p class="fontsize-lg-bold preto">{{ $myFunctions.formatCents(totals.gross_cents) }}</p>
            </div>
            <div>
                <p class="fontsize-sm cinza">Comissão do AgendasPro</p>
                <p class="fontsize-lg-bold preto">{{ $myFunctions.formatCents(totals.commission_cents) }}</p>
            </div>
            <div>
                <p class="fontsize-sm cinza">Líquido para a empresa</p>
                <p class="fontsize-lg-bold preto">{{ $myFunctions.formatCents(totals.net_cents) }}</p>
            </div>
        </div>
        <p class="fontsize-sm cinza totals-note" v-if="!loading && !loadError">
            Totais consideram apenas comissões liquidadas no período.
        </p>

        <UtilsDataTable :loaded="!loading" :dataTable="items" :rowsPerPage="10" table="comissão"
            :error="loadError" emptyText="Nenhuma comissão no período." @retry="load">
            <template #column-data="{ item }">
                <p>{{ $myFunctions.formatDate(item.created_at) }}</p>
            </template>
            <template #column-venda="{ item }">
                <p>#{{ item.sale_id }}</p>
            </template>
            <template #column-plano="{ item }">
                <p>{{ item.plan_code === "premium" ? "Premium" : "Free" }}</p>
            </template>
            <template #column-bruto="{ item }">
                <p>{{ $myFunctions.formatCents(item.gross_cents) }}</p>
            </template>
            <template #column-taxa="{ item }">
                <p>{{ $myFunctions.formatBps(item.commission_bps) }}</p>
            </template>
            <template #column-comissão="{ item }">
                <p>{{ $myFunctions.formatCents(item.commission_cents) }}</p>
            </template>
            <template #column-status="{ item }">
                <p class="tag" :class="status(item.status).tone">{{ status(item.status).label }}</p>
            </template>
            <template #column-liquidada-em="{ item }">
                <p>{{ item.settled_at ? $myFunctions.formatDate(item.settled_at) : "—" }}</p>
            </template>
        </UtilsDataTable>
    </section>
</template>

<script>
import { unwrap } from '../../utils/payloads.js';
import { commissionsParams, currentMonthRange, validatePeriod, commissionStatus } from '../../utils/billing.js';

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            periodError: "",
            period: currentMonthRange(),
            items: [],
            totals: { gross_cents: 0, commission_cents: 0, net_cents: 0 }
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        status: commissionStatus,
        load() {
            this.periodError = validatePeriod(this.period);
            if (this.periodError) return;

            this.loading = true;
            this.loadError = "";
            this.$base.api.get("/billing/commissions", { params: commissionsParams(this.period) }).then((response) => {
                const data = unwrap(response) || {};
                this.items = data.items || [];
                this.totals = data.totals_settled || { gross_cents: 0, commission_cents: 0, net_cents: 0 };
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar as comissões.");
            }).then(() => {
                this.loading = false;
            });
        }
    }
}
</script>

<style scoped>
.period-filter {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
}

.period-filter .btn {
    width: auto;
    max-width: none;
}

.totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-5);
    padding: var(--space-5);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
    margin: var(--space-5) 0 var(--space-3);
}

.totals-note {
    margin-bottom: var(--space-5);
}
</style>

<script setup>
definePageMeta({ access: 'admin', title: 'Comissões' })
</script>
