<template>
    <form id="informations-form" @submit.prevent="saveRules()" :aria-busy="loading ? 'true' : 'false'">
        <p class="fontsize-md cinza">
            Horários em que <strong>{{ professionalName }}</strong> atende. Dias sem horário ficam indisponíveis.
            Se nenhum dia tiver horário, o profissional atende a qualquer hora.
        </p>

        <UtilsLoading :loading="loading" />
        <div v-if="loadError" class="inline-error" role="alert">
            {{ loadError }}
            <button type="button" class="btn btn-cinza mt-2" v-on:click="load()">Tentar novamente</button>
        </div>

        <div class="week" v-if="!loading && !loadError">
            <fieldset class="day" v-for="day in weekdays" :key="day.value">
                <legend class="fontsize-md-bold preto">{{ day.label }}</legend>
                <p class="fontsize-sm cinza" v-if="!week[day.value].length">Sem atendimento</p>
                <div class="interval" v-for="(entry, index) in week[day.value]" :key="index">
                    <label class="sr-only" :for="'start-' + day.value + '-' + index">Início, {{ day.label }}, horário {{ index + 1 }}</label>
                    <input type="time" :id="'start-' + day.value + '-' + index" required v-model="entry.start_time">
                    <span aria-hidden="true">às</span>
                    <label class="sr-only" :for="'end-' + day.value + '-' + index">Fim, {{ day.label }}, horário {{ index + 1 }}</label>
                    <input type="time" :id="'end-' + day.value + '-' + index" required v-model="entry.end_time">
                    <button type="button" class="icon-btn" :aria-label="'Remover horário ' + (index + 1) + ' de ' + day.label"
                        v-on:click="removeInterval(day.value, index)">
                        <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
                <div class="day-actions">
                    <button type="button" class="link-btn" v-on:click="addInterval(day.value)">
                        <font-awesome icon="plus" aria-hidden="true" /> Adicionar horário
                    </button>
                    <button type="button" class="link-btn" v-if="week[day.value].length && day.value === 1"
                        v-on:click="copyToWeekdays(day.value)">
                        Copiar para segunda a sexta
                    </button>
                </div>
            </fieldset>
        </div>
        <input type="submit" id="submit-button" />
    </form>
</template>

<script>
import {
    WEEKDAYS, rulesToWeek, validateWeek, buildRulesPayload, unwrap,
} from '../../../utils/payloads.js';

export default {
    emits: ["savedContent"],
    data() {
        const current = this.$global.contentObject || {};
        const week = {};
        for (const day of WEEKDAYS) week[day.value] = [];
        return {
            professionalId: current.id,
            professionalName: current.name || "",
            weekdays: WEEKDAYS,
            week,
            loading: true,
            loadError: ""
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        async load() {
            this.loading = true;
            this.loadError = "";
            try {
                const response = await this.$base.api.get("/availability-rules", { params: { professional_id: this.professionalId } });
                this.week = rulesToWeek(unwrap(response) || []);
            } catch (error) {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os horários.");
            } finally {
                this.loading = false;
            }
        },
        addInterval(weekday) {
            const list = this.week[weekday];
            const last = list[list.length - 1];
            list.push(last ? { start_time: last.end_time, end_time: "" } : { start_time: "09:00", end_time: "18:00" });
        },
        removeInterval(weekday, index) {
            this.week[weekday].splice(index, 1);
        },
        copyToWeekdays(source) {
            const copy = this.week[source].map((e) => ({ ...e }));
            for (const day of [1, 2, 3, 4, 5]) {
                if (day !== source) this.week[day] = copy.map((e) => ({ ...e }));
            }
        },
        saveRules() {
            const errors = validateWeek(this.week);
            if (errors.length) {
                this.$myFunctions.stopModalLoading(this);
                this.$myFunctions.showFeedbackModal(this, "Revise os horários", errors.join("\n"), "warning");
                return;
            }
            this.$base.api.put("/availability-rules/professional/" + this.professionalId, buildRulesPayload(this.week))
                .then(() => {
                    this.$emit("savedContent");
                    this.$myFunctions.showFeedbackModal(this, "Sucesso", "Horários salvos com sucesso.", "success");
                }).catch((error) => {
                    this.$myFunctions.stopModalLoading(this);
                    this.$myFunctions.showFeedbackModal(this, "Erro", this.$myFunctions.errorMessage(error, "Não foi possível salvar os horários."), "error");
                });
        }
    }
}
</script>

<style scoped>
.week {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-top: var(--space-5);
}

.day {
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-5);
}

.interval {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin: var(--space-3) 0;
}

.interval input[type="time"] {
    width: auto;
    min-width: 110px;
}

.day-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    margin-top: var(--space-3);
}

.link-btn {
    background: none;
    border: 0;
    padding: var(--space-3) 0;
    min-height: 44px;
    color: var(--azul);
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}
</style>
