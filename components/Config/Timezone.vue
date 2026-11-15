<template>
    <section class="timezone-config" :aria-busy="loading ? 'true' : 'false'">
        <p class="fontsize-sm cinza mt-8">FUSO HORÁRIO DA EMPRESA</p>
        <form @submit.prevent="save()">
            <div class="input-group">
                <label for="company-timezone">Fuso usado na agenda e nos lembretes</label>
                <select id="company-timezone" v-model="selected" :disabled="loading || !isAdmin" aria-describedby="timezone-help">
                    <option value="">Padrão do sistema ({{ defaultTimezone }})</option>
                    <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
                </select>
                <span class="fontsize-sm cinza" id="timezone-help">
                    Em uso agora: <strong>{{ effective || "—" }}</strong>.
                    <template v-if="!isAdmin">Apenas administradores podem alterar.</template>
                </span>
            </div>
            <p class="inline-error" role="alert" v-if="error">{{ error }}</p>
            <button type="submit" class="btn btn-primary mt-4" :class="{ 'btn-loading': saving }"
                :disabled="loading || saving || !isAdmin || !changed" v-if="isAdmin">
                Salvar fuso horário
            </button>
        </form>
    </section>
</template>

<script>
import { BRAZIL_TIMEZONES, DEFAULT_TIMEZONE } from '../../utils/payloads.js';

export default {
    data() {
        return {
            loading: true,
            saving: false,
            error: "",
            selected: "",
            stored: "",
            effective: "",
            defaultTimezone: DEFAULT_TIMEZONE
        }
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        },
        zones() {
            // Mantém no seletor um fuso já gravado que não esteja na lista curta.
            return this.stored && !BRAZIL_TIMEZONES.includes(this.stored) ? [this.stored, ...BRAZIL_TIMEZONES] : BRAZIL_TIMEZONES;
        },
        changed() {
            return this.selected !== this.stored;
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        apply(data) {
            const value = data || {};
            this.stored = value.timezone || "";
            this.selected = this.stored;
            this.effective = value.effective || this.stored || DEFAULT_TIMEZONE;
        },
        load() {
            this.loading = true;
            this.error = "";
            this.$base.api.get("/companies/timezone").then((response) => {
                this.apply(response.data.returnObj);
            }).catch((error) => {
                this.error = this.$myFunctions.errorMessage(error, "Não foi possível carregar o fuso horário.");
            }).then(() => {
                this.loading = false;
            });
        },
        save() {
            this.saving = true;
            this.error = "";
            // "" volta ao padrão do sistema (null no contrato).
            this.$base.api.put("/companies/timezone", { timezone: this.selected || null }).then((response) => {
                this.apply(response.data.returnObj);
                this.$myFunctions.showToast(this, "Fuso horário atualizado.", "success");
            }).catch((error) => {
                this.error = this.$myFunctions.errorMessage(error, "Não foi possível salvar o fuso horário.");
            }).then(() => {
                this.saving = false;
            });
        }
    }
}
</script>

<style scoped>
.timezone-config select {
    max-width: 420px;
}

@media (max-width: 768px) {
    .timezone-config button[type="submit"] {
        width: 100%;
        max-width: 100%;
    }
}
</style>
