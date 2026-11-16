<template>
    <section class="billing-plan" :aria-busy="loading ? 'true' : 'false'">
        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="empty-state text-center" role="alert">
            <h2>{{ loadError }}</h2>
            <button type="button" class="btn btn-primary mt-4 mx-auto" v-on:click="load()">Tentar novamente</button>
        </div>

        <template v-if="!loading && !loadError">
            <!-- Situação atual -->
            <div class="current-plan" role="status">
                <div>
                    <p class="fontsize-sm cinza">Seu plano atual</p>
                    <h2 class="fontsize-lg-bold preto">{{ entitlement.plan_name || "—" }}</h2>
                    <p class="fontsize-md cinza" v-if="sourceLabel">{{ sourceLabel }}</p>
                </div>
                <div>
                    <p class="fontsize-sm cinza">Comissão por venda no Pix</p>
                    <h2 class="fontsize-lg-bold preto">{{ $myFunctions.formatBps(entitlement.commission_bps) }}</h2>
                </div>
                <div v-if="entitlement.paid_through">
                    <p class="fontsize-sm cinza">Pago até</p>
                    <h2 class="fontsize-lg-bold preto">{{ $myFunctions.formatDate(entitlement.paid_through) }}</h2>
                </div>
            </div>

            <div class="notice notice-warning" role="alert" v-if="entitlement.source === 'grace'">
                <span>
                    Seu pagamento está vencido. O Premium continua ativo até
                    <strong>{{ $myFunctions.formatDate(entitlement.grace_until) }}</strong>; regularize para não voltar ao plano Free.
                </span>
            </div>

            <div class="notice notice-info" role="status" v-if="pendingUrl">
                <span>Sua assinatura Premium aguarda o pagamento da fatura. O plano muda assim que o pagamento for confirmado.</span>
                <a :href="pendingUrl" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Pagar fatura</a>
            </div>

            <div class="notice notice-info" role="status" v-else-if="subscription && subscription.status === 'active' && subscription.next_due_date">
                <span>
                    Assinatura {{ subscriptionStatus.toLowerCase() }}. Próximo vencimento em
                    <strong>{{ $myFunctions.formatDate(subscription.next_due_date) }}</strong>
                    ({{ $myFunctions.formatCents(subscription.price_cents) }}).
                </span>
            </div>

            <div class="notice notice-warning" role="status" v-if="overview.subscriptions_enabled === false">
                <span>A contratação de planos pagos está temporariamente indisponível.</span>
            </div>

            <!-- Planos -->
            <div class="plans-grid">
                <article class="plan-card" v-for="plan in plans" :key="plan.code"
                    :class="{ current: plan.code === entitlement.plan_code }" :aria-labelledby="'plan-' + plan.code">
                    <header>
                        <h3 class="fontsize-md-bold preto" :id="'plan-' + plan.code">{{ plan.name }}</h3>
                        <span class="tag green" v-if="plan.code === entitlement.plan_code">Plano atual</span>
                    </header>
                    <p class="plan-price preto">
                        {{ plan.price_cents > 0 ? $myFunctions.formatCents(plan.price_cents) : "Grátis" }}
                        <span class="fontsize-sm cinza" v-if="plan.price_cents > 0">/ mês</span>
                    </p>
                    <p class="fontsize-md cinza">
                        Comissão de <strong>{{ $myFunctions.formatBps(plan.commission_bps) }}</strong> sobre cada venda paga por Pix.
                    </p>

                    <div class="plan-actions" v-if="isAdmin">
                        <template v-if="plan.code === 'premium' && entitlement.plan_code !== 'premium'">
                            <div class="input-group" v-if="!pendingUrl">
                                <label for="billing-type">Forma de pagamento</label>
                                <select id="billing-type" v-model="billingType">
                                    <option v-for="type in billingTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
                                </select>
                            </div>
                            <button type="button" class="btn btn-primary" :class="{ 'btn-loading': saving }"
                                :disabled="saving || overview.subscriptions_enabled === false" v-on:click="subscribe()">
                                {{ pendingUrl ? "Gerar nova cobrança" : "Assinar Premium" }}
                            </button>
                        </template>
                        <button type="button" class="btn btn-cinza" :class="{ 'btn-loading': saving }" :disabled="saving"
                            v-if="plan.code === 'free' && (entitlement.plan_code === 'premium' || subscription)"
                            v-on:click="downgrade()">
                            Voltar ao Free
                        </button>
                    </div>
                </article>
            </div>
            <p class="fontsize-sm cinza" v-if="!isAdmin">Apenas administradores podem mudar de plano.</p>

            <!-- Comparativo -->
            <h3 class="fontsize-md-bold preto section-title">Comparativo de recursos</h3>
            <div class="matrix-wrapper">
                <table class="matrix">
                    <caption class="sr-only">Comparativo entre os planos Free e Premium</caption>
                    <thead>
                        <tr>
                            <th scope="col">Recurso</th>
                            <th scope="col">Free</th>
                            <th scope="col">Premium</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in matrix" :key="row.key">
                            <th scope="row">
                                {{ row.label }}
                                <span class="tag soon fontsize-sm" v-if="row.soon">em breve</span>
                            </th>
                            <td data-th="Free">{{ row.free }}</td>
                            <td data-th="Premium">{{ row.premium }}</td>
                        </tr>
                        <tr>
                            <th scope="row">Comissão por venda no Pix</th>
                            <td data-th="Free">{{ commissionOfPlan('free') }}</td>
                            <td data-th="Premium">{{ commissionOfPlan('premium') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="fontsize-sm cinza">Recursos marcados com "em breve" ainda não estão disponíveis.</p>
        </template>
    </section>
</template>

<script>
import { unwrap, buildSubscriptionPayload } from '../../utils/payloads.js';
import {
    BILLING_TYPES, DEFAULT_BILLING_TYPE, PLAN_MATRIX, sortPlans, entitlementSourceLabel,
    subscriptionStatusLabel, safeExternalUrl,
} from '../../utils/billing.js';

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            saving: false,
            plans: [],
            overview: {},
            billingType: DEFAULT_BILLING_TYPE,
            billingTypes: BILLING_TYPES,
            matrix: PLAN_MATRIX
        }
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        },
        entitlement() {
            return this.overview.entitlement || {};
        },
        subscription() {
            return this.overview.subscription || null;
        },
        pendingUrl() {
            return safeExternalUrl(this.overview.pending_invoice_url);
        },
        sourceLabel() {
            return entitlementSourceLabel(this.entitlement.source);
        },
        subscriptionStatus() {
            return this.subscription ? subscriptionStatusLabel(this.subscription.status) : "";
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        commissionOfPlan(code) {
            const plan = this.plans.find((p) => p.code === code);
            return plan ? this.$myFunctions.formatBps(plan.commission_bps) : "—";
        },
        async load() {
            this.loading = true;
            this.loadError = "";
            try {
                const [plans, overview] = await Promise.all([
                    this.$base.api.get("/billing/plans"),
                    this.$base.api.get("/billing/subscription")
                ]);
                this.plans = sortPlans(unwrap(plans) || []);
                this.overview = unwrap(overview) || {};
            } catch (error) {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os planos.");
            } finally {
                this.loading = false;
            }
        },
        async change(planCode, successMessage) {
            this.saving = true;
            try {
                const response = await this.$base.api.post("/billing/subscription", buildSubscriptionPayload(planCode, this.billingType));
                this.overview = unwrap(response) || this.overview;
                this.$myFunctions.showToast(this, successMessage, "success");
            } catch (error) {
                // 402/503 já foram tratados globalmente (modal/aviso).
                this.$myFunctions.notifyError(this, error, "Não foi possível alterar o plano.");
            } finally {
                this.saving = false;
            }
        },
        subscribe() {
            return this.change("premium", "Assinatura criada. Pague a fatura para ativar o Premium.");
        },
        async downgrade() {
            const ok = await this.$myFunctions.confirmDialog({
                title: "Voltar ao plano Free",
                message: "A assinatura será cancelada. O período já pago continua valendo até o fim. Depois disso, valem os limites e a comissão do plano Free.",
                confirmLabel: "Voltar ao Free",
                danger: true
            });
            if (ok) await this.change("free", "Assinatura cancelada. Você voltará ao Free ao fim do período pago.");
        }
    }
}
</script>

<style scoped>
.current-plan {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
    padding: var(--space-6);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-6);
}

.notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-6);
}

.notice-info {
    background: var(--azul-claro);
}

.notice-warning {
    background: var(--amarelo-claro);
    border: 1px solid var(--amarelo);
}

.notice .btn {
    width: auto;
    max-width: none;
}

.plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-6);
    margin-bottom: var(--space-6);
}

.plan-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
}

.plan-card.current {
    border-color: var(--verde-escuro);
    box-shadow: var(--boxshadow-default);
}

.plan-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
}

.plan-price {
    font-size: 28px;
    font-weight: 700;
}

.plan-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: auto;
}

.plan-actions .btn {
    max-width: none;
    width: 100%;
}

.section-title {
    margin: var(--space-8) 0 var(--space-4);
}

.matrix-wrapper {
    overflow-x: auto;
}

.matrix {
    width: 100%;
    border-collapse: collapse;
}

.matrix th,
.matrix td {
    text-align: left;
    padding: var(--space-4);
    border-bottom: 1px solid var(--cinza-medio);
    vertical-align: top;
}

.matrix thead th {
    background: var(--cinza-claro);
}

.tag.soon {
    display: inline-block;
    margin-left: var(--space-3);
    padding: var(--space-1) var(--space-3);
    background: var(--amarelo-claro);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

@media (max-width: 640px) {
    .matrix thead {
        display: none;
    }

    .matrix tr {
        display: block;
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--cinza-medio);
    }

    .matrix th,
    .matrix td {
        display: block;
        border: 0;
        padding: var(--space-2) var(--space-4);
    }

    .matrix td::before {
        content: attr(data-th) ": ";
        font-weight: 600;
    }
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'Plano' })
</script>
