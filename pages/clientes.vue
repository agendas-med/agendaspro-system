<template>
    <section>
        <UtilsPageheader title="Clientes" subtitle="Veja todas as informações dos seus clientes" />
        <UtilsTabs :tabs="tabs" @changedTab="changeCustomers($event)" />
        <UtilsDataTable :loaded="!loading" :dataTable="filteredClientes" :rowsPerPage="7" :newButton="true"
            :error="loadError" emptyText="Você ainda não tem clientes. Cadastre o primeiro para começar a agendar."
            @retry="returnCustomers" @handleNew="newCustomer" table="cliente">
            <template #column-cliente="{ item }">
                <div class="flex items-center">
                    <img :src="item.image == '' ? defaultUserImage : item.image"
                        class="avatar avatar-pp" alt="">
                    <div>
                        <p><strong>{{ item.name }}</strong></p>
                    </div>
                </div>
            </template>
            <template #column-telefone="{ item }">
                <p>{{ $myFunctions.formatTel(item.tel) }}</p>
            </template>
            <template #column-último-agendamento="{ item }">
                <p>{{ $myFunctions.formatDate(item.last_appointment) }}</p>
            </template>
            <template #column-próximo-agendamento="{ item }">
                <p>{{ $myFunctions.formatDate(item.next_appointment) }}</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" :aria-label="'Criar agendamento para ' + item.name" :title="'Criar agendamento para ' + item.name" v-on:click="handleCreateSchedule(item)">
                        <font-awesome icon="calendar-day" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" :aria-label="'Excluir cliente ' + item.name" :title="'Excluir cliente ' + item.name" v-on:click="handleDeleteCustomer(item)">
                        <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" :aria-label="'Editar cliente ' + item.name" :title="'Editar cliente ' + item.name" v-on:click="handleEditCustomer(item)">
                        <font-awesome icon="user-pen" class="cinza" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
        <UtilsModal excludepath="/customers/" @closeModal="$myFunctions.closeModal($.proxy); returnCustomers()">
            <ModalContentAgenda v-if="modalContentAgenda" :event="selectedEvent"
                @savedContent="$myFunctions.closeModal($.proxy, [], true); goToSchedule()" />
            <ModalContentClientes v-if="modalContentClientes"
                @savedContent="$myFunctions.closeModal($.proxy, []); returnCustomers()" />
        </UtilsModal>
    </section>
</template>

<script>
import defaultUserImage from '@/assets/img/default-user-image.png';

export default {
    data() {
        return {
            defaultUserImage: defaultUserImage,
            tabs: [
                {
                    name: "Todos os clientes",
                    quantity: null,
                    default: true
                },
                {
                    name: "Já agendaram",
                    quantity: null,
                    default: false
                },
                {
                    name: "Nunca agendaram",
                    quantity: null,
                    default: false
                }
            ],
            loading: true,
            loadError: "",
            modalContentAgenda: false,
            modalContentClientes: false,
            clientes: [],
            filteredClientes: []
        }
    },
    mounted: function () {
        this.returnCustomers();
    },
    methods: {
        changeCustomers: function (event) {
            if (this.clientes.length == 0) return;

            switch (event) {
                case 0: //todos
                    this.filteredClientes = this.clientes;
                    break;
                case 1: //fidelizados
                    this.filteredClientes = this.clientes.filter((cliente) => { return cliente.last_appointment != "" || cliente.next_appointment != "" });
                    break;
                case 2: //nao-fidelizados
                    this.filteredClientes = this.clientes.filter((cliente) => { return cliente.last_appointment == "" && cliente.next_appointment == "" });
                    break;
            }
        },
        returnCustomers: function () {
            this.loadError = "";

            this.$base.api.get("/customers").then((response) => {
                this.clientes = response.data.returnObj || [];
                this.filteredClientes = this.clientes;
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os clientes");
                this.$myFunctions.notifyError(this, error, "Não foi possível carregar os clientes");
            }).then(() => {
                this.loading = false;
            })
        },
        handleCreateSchedule: function (user) {
            let rowUser = {
                customer_id: user.id,
                customer_name: user.name,
                service: "",
                date: moment().format("YYYY-MM-DD") + "T09:00:00",
                duration: "",
                observations: ""
            }

            this.$myFunctions.openModal({
                instance: this,
                title: "Criar agendamento",
                saveButton: "Criar",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentAgenda",
                contentObject: rowUser
            });
        },
        handleEditCustomer: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Alterar cliente",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentClientes",
                contentObject: item
            });
        },
        goToSchedule: function () {
            setTimeout(() => {
                this.$router.push("/agenda");
            }, 400)
        },
        handleDeleteCustomer: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Excluir cliente",
                saveButton: "Excluir",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        newCustomer: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar cliente",
                saveButton: "Cadastrar",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentClientes"
            });
        }
    }
}
</script>
<style>
.icon-filter {
    width: 35px;
    height: 35px;
    margin: 0;
}

.container {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
    max-width: 100%;
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'Clientes' })
</script>
