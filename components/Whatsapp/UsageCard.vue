<template>
    <section class="ui-card" aria-labelledby="wa-usage-title" :aria-busy="loading ? 'true' : 'false'">
        <header class="ui-card-header">
            <h2 class="fontsize-md-bold preto" id="wa-usage-title">Uso do mês</h2>
            <div class="period">
                <label for="wa-period" class="fontsize-sm cinza">Período</label>
                <select id="wa-period" v-model="period" v-on:change="load()" :disabled="loading">
                    <option v-for="p in periods" :key="p" :value="p">{{ periodName(p) }}</option>
                </select>
            </div>
        </header>

        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="wa-error" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-primary" v-on:click="load()">Tentar novamente</button>
        </div>

        <template v-if="!loading && !loadError">
            <p class="fontsize-md preto" v-if="usage.unlimited">
                <strong>{{ usage.used }}</strong> mensagens enviadas neste período. Seu plano não tem limite mensal.
            </p>
            <template v-else>
                <p class="fontsize-md preto">
                    <strong>{{ usage.used }}</strong> de <strong>{{ usage.limit }}</strong> mensagens do plano
                    {{ planName }} em {{ periodName(period) }}.
                </p>
                <div class="bar" role="progressbar" aria-label="Mensagens usadas no mês" aria-valuemin="0"
                    :aria-valuemax="usage.limit" :aria-valuenow="Math.min(usage.used, usage.limit)"
                    :aria-valuetext="usage.used + ' de ' + usage.limit + ' mensagens'">
                    <div class="bar-fill" :class="usage.tone" :style="{ width: usage.percent + '%' }"></div>
                </div>
                <p class="fontsize-sm cinza" v-if="!usage.exceeded">Restam {{ usage.remaining }} mensagens neste mês.</p>
            </template>

            <div class="ui-notice danger" role="alert" v-if="isCurrent && usage.exceeded && usage.upgradeInvite">
                <p>
                    <strong>Você atingiu o limite de mensagens do plano Free.</strong>
                    O bot e os atendentes não conseguem enviar novas mensagens até o próximo mês. Com o Premium o envio continua.
                </p>
                <NuxtLink to="/billing/plano" class="btn btn-primary" v-if="isAdmin">Ver planos e fazer upgrade</NuxtLink>
                <p class="fontsize-sm" v-else>Peça ao administrador da empresa para mudar de plano.</p>
            </div>
            <div class="ui-notice" role="status" v-else-if="usage.exceeded">
                O limite mensal de mensagens do plano foi atingido.
            </div>
            <div class="ui-notice" role="status" v-else-if="isCurrent && usage.near">
                Você já usou {{ usage.percent }}% das mensagens do mês.
                <template v-if="usage.plan !== 'premium'">O Premium remove o limite.</template>
            </div>

            <dl class="breakdown">
                <div><dt>Recebidas dos clientes</dt><dd>{{ usage.breakdown.inbound }}</dd></div>
                <div><dt>Respostas do bot</dt><dd>{{ usage.breakdown.botReplies }}</dd></div>
                <div><dt>Entregues</dt><dd>{{ usage.breakdown.delivered }}</dd></div>
                <div><dt>Lidas</dt><dd>{{ usage.breakdown.read }}</dd></div>
                <div><dt>Falhas de envio</dt><dd>{{ usage.breakdown.failed }}</dd></div>
                <div><dt>Tokens de IA</dt><dd>{{ usage.ai.tokens.toLocaleString("pt-BR") }}</dd></div>
            </dl>
        </template>
    </section>
</template>

<script>
import { normalizeUsage, currentPeriod, periodLabel } from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

function lastPeriods(count) {
    const now = new Date();
    const list = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        list.push(currentPeriod(d));
    }
    return list;
}

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            usage: normalizeUsage(null),
            period: currentPeriod(),
            periods: lastPeriods(6)
        };
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        },
        isCurrent() {
            return this.period === currentPeriod();
        },
        planName() {
            return this.usage.plan === "premium" ? "Premium" : "Free";
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        periodName(p) {
            return periodLabel(p);
        },
        async load() {
            this.loading = true;
            this.loadError = "";
            const requested = this.period;
            try {
                const response = await this.$base.api.get("/whatsapp/usage", { params: { period: requested } });
                if (requested !== this.period) return;
                this.usage = normalizeUsage(unwrap(response));
            } catch (error) {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar o uso do WhatsApp.");
            } finally {
                this.loading = false;
            }
        }
    }
}
</script>

<style scoped>
.period {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.period select {
    height: 44px;
}

.bar {
    height: 12px;
    background: var(--cinza-medio);
    border-radius: var(--radius-xs);
    overflow: hidden;
}

.bar-fill {
    height: 100%;
    transition: width 0.4s;
    background: var(--verde-escuro);
}

.bar-fill.yellow {
    background: var(--amarelo);
}

.bar-fill.red {
    background: var(--vermelho);
}

.wa-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
}

.wa-error .btn {
    width: auto;
}

.breakdown {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-4);
    margin: 0;
}

.breakdown div {
    padding: var(--space-4);
    background: var(--cinza-claro);
    border-radius: var(--radius-md);
}

.breakdown dt {
    font-size: var(--fontsize-sm);
    color: var(--cinza);
}

.breakdown dd {
    margin: 0;
    font-weight: 700;
}
</style>
