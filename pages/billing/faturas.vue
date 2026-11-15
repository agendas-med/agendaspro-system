<template>
    <section>
        <UtilsDataTable :loaded="!loading" :dataTable="invoices" :rowsPerPage="10" table="fatura"
            :error="loadError" emptyText="Nenhuma fatura encontrada." @retry="load">
            <template #column-vencimento="{ item }">
                <p>{{ $myFunctions.formatDate(item.due_date) }}</p>
            </template>
            <template #column-período="{ item }">
                <p>{{ $myFunctions.formatDate(item.period_start) }} a {{ $myFunctions.formatDate(item.period_end) }}</p>
            </template>
            <template #column-plano="{ item }">
                <p>{{ planName(item.plan_code) }}</p>
            </template>
            <template #column-valor="{ item }">
                <p>{{ $myFunctions.formatCents(item.amount_cents) }}</p>
            </template>
            <template #column-status="{ item }">
                <p class="tag" :class="status(item.status).tone">{{ status(item.status).label }}</p>
            </template>
            <template #column-pago-em="{ item }">
                <p>{{ item.paid_at ? $myFunctions.formatDate(item.paid_at) : "—" }}</p>
            </template>
            <template #column-fatura="{ item }">
                <a v-if="link(item.invoice_url)" :href="link(item.invoice_url)" target="_blank" rel="noopener noreferrer"
                    class="invoice-link">
                    {{ item.status === 'paid' ? "Ver recibo" : "Abrir fatura" }}
                </a>
                <span v-else class="cinza">—</span>
            </template>
        </UtilsDataTable>
    </section>
</template>

<script>
import { unwrap } from '../../utils/payloads.js';
import { invoiceStatus, safeExternalUrl } from '../../utils/billing.js';

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            invoices: []
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        status: invoiceStatus,
        link: safeExternalUrl,
        planName(code) {
            return code === "premium" ? "Premium" : code === "free" ? "Free" : (code || "—");
        },
        load() {
            this.loading = true;
            this.loadError = "";
            this.$base.api.get("/billing/invoices").then((response) => {
                this.invoices = unwrap(response) || [];
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar as faturas.");
            }).then(() => {
                this.loading = false;
            });
        }
    }
}
</script>

<style scoped>
.invoice-link {
    color: var(--azul);
    text-decoration: underline;
}
</style>

<script setup>
definePageMeta({ access: 'admin', title: 'Faturas' })
</script>
