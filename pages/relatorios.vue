<template>
    <section>
        <UtilsPageheader title="Relatórios" subtitle="Visualize seus agendamentos e ganhos em relatórios completos." />
        <UtilsTabs :tabs="tabs" @changedTab="changeChart($event)" />
        <div>
            <div class="filter">
                <select v-model="dateRange" aria-label="Período do relatório">
                    <option value="anual">Anual</option>
                    <option value="semanal">Semanal</option>
                </select>
                <input v-if="dateRange === 'anual'" aria-label="Ano" type="number" v-model="year" @keydown.enter="updateChartRange" placeholder="Ano" />
                <input v-if="dateRange === 'semanal'" aria-label="Semana" type="week" v-model="week" placeholder="Semana" />
                <button type="button" class="btn btn-primary" v-if="year != null || week != null" v-on:click="updateChartRange">Buscar</button>
            </div>
            <div class="chart-container">
                <UtilsLoading :loading="loading" />
                <Chart v-if="!loading && !loadError && data.chartData" :chartData="data.chartData" :chartType="data.type" :chartTitle="data.title" :type="data.labelType" />
                <div v-else-if="!loading" class="empty-state" role="status">
                    <p class="fontsize-md cinza">{{ loadError ? 'Não foi possível carregar o relatório.' : 'Sem dados para o período selecionado.' }}</p>
                    <button type="button" class="btn btn-primary mt-4" v-on:click="updateChartRange">Tentar novamente</button>
                </div>
            </div>
        </div>
    </section>
</template>
<script>
export default {
    data() {
        return {
            tabs: [
                {
                    name: "Atendimentos realizados",
                    quantity: null,
                    default: true
                },
                {
                    name: "Faturamento",
                    quantity: null,
                    default: false
                }
            ],
            loading: true,
            loadError: false,
            data: {},
            dateRange: "anual", 
            year: new Date().getFullYear(),
            week: null,
            type: ""
        }
    },
    watch: {
        dateRange: function () {
            this.year = null;
            this.week = null;
        }
    },
    methods: {
        resetFilters: function () {
            this.dateRange = "anual";

            nextTick(() => {
                this.year = new Date().getFullYear();
                this.week = null;
            })
        },
        changeChart: function (event) {
            switch (event) {
                case 0:
                    this.type = "consultas";
                    break;
                case 1:
                    this.type = "faturamento";
                    break;
            }

            this.resetFilters();
            this.returnChart(this.type);
        },
        returnChart: function (type = "", dateRange = "") {
            let self = this;

            if (!this.year) this.year = new Date().getFullYear();

            this.loading = true;

            let data = {
                type: this.dateRange,
                date: this.dateRange == "anual" ? this.year : this.week
            }

            if (type == "faturamento") {
                self.$base.api.post("/reports/invoicing", data) 
                .then(function (response) { 
                    self.data =  {
                        chartData: response.data.returnObj,
                        type: "bar",
                        title: "Faturamento",
                        labelType: "currency"
                    }
                    self.loadError = false;
                }).catch((error) => {
                    self.loadError = true;
                    self.$myFunctions.notifyError(self, error, "Não foi possível carregar o relatório de faturamento");
                }).then(() => {
                    self.loading = false;
                })
            } else {
                self.$base.api.post("/reports/appointments", data) 
                .then(function (response) { 
                    self.data =  {
                        chartData: response.data.returnObj,
                        type: "line",
                        title: "Atendimentos realizados",
                        labelType: "number"
                    }
                    self.loadError = false;
                }).catch((error) => {
                    self.loadError = true;
                    self.$myFunctions.notifyError(self, error, "Não foi possível carregar o relatório de atendimentos");
                }).then(() => {
                    self.loading = false;
                })
            }
        },
        updateChartRange() {
            this.returnChart(this.type, this.dateRange);
        }
    },
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Relatórios' })
</script>
