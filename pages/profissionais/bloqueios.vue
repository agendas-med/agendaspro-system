<template>
    <section>
        <form class="block-form" @submit.prevent="create()">
            <h2 class="fontsize-lg-bold preto">Novo bloqueio</h2>
            <p class="fontsize-sm cinza">Use para feriados, folgas e ausências. Nesses horários não é possível agendar.</p>

            <div class="form-grid">
                <div class="input-group">
                    <label for="block-scope">Vale para</label>
                    <select id="block-scope" v-model="form.scope">
                        <option value="company">Empresa inteira (feriado)</option>
                        <option v-for="p in activeProfessionals" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>

                <div class="input-checkbox-group">
                    <label for="block-allday">Dia inteiro</label>
                    <input type="checkbox" id="block-allday" v-model="form.allDay">
                </div>

                <div class="input-group" v-if="form.allDay">
                    <label for="block-date">Data</label>
                    <input type="date" id="block-date" required v-model="form.date">
                </div>
                <template v-else>
                    <div class="input-group">
                        <label for="block-start">Início</label>
                        <input type="datetime-local" id="block-start" required v-model="form.startsAt">
                    </div>
                    <div class="input-group">
                        <label for="block-end">Fim</label>
                        <input type="datetime-local" id="block-end" required v-model="form.endsAt">
                    </div>
                </template>

                <div class="input-group">
                    <label for="block-reason">Motivo <span class="optional">(opcional)</span></label>
                    <input type="text" id="block-reason" maxlength="255" v-model="form.reason">
                </div>
            </div>

            <p class="inline-error" role="alert" v-if="formError">{{ formError }}</p>
            <button type="submit" class="btn btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving">Adicionar bloqueio</button>
        </form>

        <form class="period-filter" @submit.prevent="load()">
            <div class="input-group">
                <label for="blocks-from">De</label>
                <input type="date" id="blocks-from" v-model="period.from">
            </div>
            <div class="input-group">
                <label for="blocks-to">Até</label>
                <input type="date" id="blocks-to" v-model="period.to">
            </div>
            <button type="submit" class="btn btn-cinza" :disabled="loading">Filtrar</button>
        </form>
        <p class="inline-error" role="alert" v-if="periodError">{{ periodError }}</p>

        <UtilsDataTable :loaded="!loading" :dataTable="rows" :rowsPerPage="8" table="bloqueio" :error="loadError"
            emptyText="Nenhum bloqueio no período." @retry="load">
            <template #column-quem="{ item }">
                <p class="tag" :class="item.professional_id == null ? 'yellow' : 'green'">{{ item.who }}</p>
            </template>
            <template #column-início="{ item }">
                <p>{{ item.starts }}</p>
            </template>
            <template #column-fim="{ item }">
                <p>{{ item.ends }}</p>
            </template>
            <template #column-motivo="{ item }">
                <p>
                    <span class="tag google-tag" v-if="item.fromGoogle">Google</span>
                    {{ item.reason || "—" }}
                </p>
            </template>
            <template #column-ações="{ item }">
                <span class="fontsize-sm cinza" v-if="item.fromGoogle" :title="'Importado do Google Agenda. Para remover, apague o evento no Google ou desfaça o vínculo em Integrações.'">Somente leitura</span>
                <button v-else type="button" class="rounded-button" :aria-label="'Remover bloqueio de ' + item.who + ' em ' + item.starts"
                    :title="'Remover bloqueio'" v-on:click="remove(item)">
                    <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                </button>
            </template>
        </UtilsDataTable>
    </section>
</template>

<script>
import { unwrap, buildTimeBlockPayload, timeBlocksParams, formatWall } from '../../utils/payloads.js';
import { validatePeriod } from '../../utils/billing.js';

function emptyForm() {
    return { scope: "company", allDay: true, date: "", startsAt: "", endsAt: "", reason: "" };
}

export default {
    data() {
        const today = moment().format("YYYY-MM-DD");
        return {
            loading: true,
            loadError: "",
            periodError: "",
            saving: false,
            formError: "",
            professionals: [],
            blocks: [],
            period: { from: today, to: moment().add(1, "year").format("YYYY-MM-DD") },
            form: emptyForm()
        }
    },
    computed: {
        activeProfessionals() {
            return this.professionals.filter((p) => p.active);
        },
        rows() {
            const names = {};
            for (const p of this.professionals) names[p.id] = p.name;
            return this.blocks.map((b) => ({
                id: b.id,
                professional_id: b.professional_id,
                who: b.professional_id == null ? "Empresa" : (names[b.professional_id] || "Profissional #" + b.professional_id),
                starts: formatWall(b.starts_at),
                ends: formatWall(b.ends_at),
                reason: b.reason || "",
                fromGoogle: b.source === "google"
            }));
        }
    },
    mounted() {
        this.loadProfessionals();
        this.load();
    },
    methods: {
        loadProfessionals() {
            this.$base.api.get("/professionals", { params: { include_inactive: true } }).then((response) => {
                this.professionals = unwrap(response) || [];
            }).catch(() => { /* a lista de bloqueios ainda funciona; os nomes caem para "Profissional #id" */ });
        },
        load() {
            this.periodError = validatePeriod(this.period);
            if (this.periodError) return;

            this.loadError = "";
            this.$base.api.get("/time-blocks", { params: timeBlocksParams(this.period) }).then((response) => {
                this.blocks = unwrap(response) || [];
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os bloqueios.");
            }).then(() => {
                this.loading = false;
            });
        },
        create() {
            this.formError = "";
            const built = buildTimeBlockPayload(this.form);
            if (built.error) {
                this.formError = built.error;
                return;
            }
            this.saving = true;
            this.$base.api.post("/time-blocks", built.payload).then(() => {
                this.$myFunctions.showToast(this, "Bloqueio adicionado.", "success");
                this.form = emptyForm();
                this.load();
            }).catch((error) => {
                this.formError = this.$myFunctions.errorMessage(error, "Não foi possível adicionar o bloqueio.");
            }).then(() => {
                this.saving = false;
            });
        },
        async remove(item) {
            if (item.fromGoogle) return; // importado do Google: o core recusa (409); a UI nem oferece
            const ok = await this.$myFunctions.confirmDialog({
                title: "Remover bloqueio",
                message: "O horário de " + item.starts + " a " + item.ends + " (" + item.who + ") volta a ficar disponível para agendamento.",
                confirmLabel: "Remover",
                danger: true
            });
            if (!ok) return;
            try {
                await this.$base.api.delete("/time-blocks/" + item.id);
                this.$myFunctions.showToast(this, "Bloqueio removido.", "success");
                this.load();
            } catch (error) {
                // 409: o bloqueio passou a vir do Google desde o último carregamento; recarrega para refletir.
                this.$myFunctions.notifyError(this, error, "Não foi possível remover o bloqueio.");
                if (error?.response?.status === 409) this.load();
            }
        }
    }
}
</script>

<style scoped>
.block-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
    margin: var(--space-5) 0;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-5);
    align-items: end;
}

.block-form .btn,
.period-filter .btn {
    width: auto;
    max-width: none;
    align-self: flex-start;
}

.google-tag {
    display: inline-block;
    margin-right: var(--space-3);
    padding: var(--space-1) var(--space-3);
}

.period-filter {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
}
</style>

<script setup>
definePageMeta({ access: 'admin', title: 'Bloqueios' })
</script>
