<template>
    <section>
        <UtilsPageheader title="Painel de Check-in" subtitle="Realize o check-in e check-out dos agendamentos do dia." />
        <UtilsDataTable class="mt-10" :loaded="!loading" :dataTable="appointments" :rowsPerPage="7" :newButton="false" table="agendamento"
            :error="loadError" emptyText="Nenhum agendamento para hoje. Crie um na agenda para fazer o check-in." @retry="getAppointments">
            <template #column-cliente="{ item }">
                <div class="flex items-center">
                    <img :src="item.image == '' ? defaultUserImage : $myFunctions.fileUrl(item.image)" class="avatar avatar-pp" alt="">
                    <div>
                        <p><strong>{{ item.customer_name }}</strong></p>
                    </div>
                </div>
            </template>
            <template #column-agendamento="{ item }">
                <p>{{ item.services[0]?.name || 'Sem serviço' }}</p>
            </template>
            <template #column-hora="{ item }">
                <p class="items-center">{{ $myFunctions.formatHour(item.date) }}</p>
            </template>
            <template #column-status="{ item }">
                <p>
                    <UtilsBadge class="text-center" :background="item.status == 'pendente_pagamento' ? '#f97316' : item.status == 'agendado' ? 'var(--amarelo)' : item.status == 'iniciado' ? 'var(--azul)' : item.status == 'realizado' ? 'var(--verde-escuro)' : 'var(--vermelho)'" :text="item.status === 'pendente_pagamento' ? 'Aguardando pagamento' : item.status" />
                </p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" v-on:click="handleInitAppointment(item)" v-if="item.status == 'agendado'" title="Iniciar agendamento" aria-label="Iniciar agendamento" :disabled="busyId === item.id">
                        <font-awesome icon="circle-play" class="azul" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" v-on:click="handleStopAppointment(item)" v-if="item.status == 'iniciado'" title="Terminar agendamento" aria-label="Terminar agendamento" :disabled="busyId === item.id">
                        <font-awesome icon="circle-stop" class="verde" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" v-on:click="handleCancelAppointment(item)" v-if="['agendado', 'pendente_pagamento'].includes(item.status)" title="Cancelar agendamento" aria-label="Cancelar agendamento" :disabled="busyId === item.id">
                        <font-awesome icon="circle-xmark" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
    </section>
</template>

<script>
import defaultUserImage from '@/assets/img/default-user-image.png';

export default {
    data() {
        return {  
            defaultUserImage: defaultUserImage,
            appointments: [],
            loading: true,
            loadError: "",
            busyId: null
        }
    },
    methods: {
        getAppointments: function () {
            this.loadError = "";

            return this.$base.api.get("/appointments?today=true")
            .then((response) => {
                this.appointments = response.data.returnObj || [];
            })
            .catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os agendamentos de hoje");
                this.$myFunctions.notifyError(this, error, "Não foi possível carregar os agendamentos de hoje");
            }).then(() => {
                this.loading = false;
            });
        },
        // Executa uma ação (init/stop/cancel) com bloqueio de clique duplo e aviso em caso de erro.
        runAction: function (item, action, failMessage, successMessage) {
            this.busyId = item.id;

            return this.$base.api.post("/appointments/" + action + "/" + item.id)
            .then(() => {
                if (successMessage) this.$myFunctions.showToast(this, successMessage, "success");
                return this.getAppointments();
            })
            .catch((error) => {
                this.$myFunctions.notifyError(this, error, failMessage);
            })
            .then(() => {
                this.busyId = null;
            });
        },
        handleInitAppointment: function (item) {
            return this.runAction(item, "init", "Não foi possível iniciar o agendamento");
        },
        handleStopAppointment: function (item) {
            return this.runAction(item, "stop", "Não foi possível terminar o agendamento");
        },
        handleCancelAppointment: async function (item) {
            const confirmed = await this.$myFunctions.confirmDialog({
                title: "Cancelar agendamento",
                message: "Deseja cancelar o agendamento de " + item.customer_name + "?",
                confirmLabel: "Cancelar agendamento",
                cancelLabel: "Voltar",
                danger: true
            });
            if (!confirmed) return;

            return this.runAction(item, "cancel", "Não foi possível cancelar o agendamento", "Agendamento cancelado");
        }
    },
    mounted: function () {
        this.getAppointments();
    }
}
</script>

<script setup>
definePageMeta({ access: 'member', title: 'Check-in' })
</script>
