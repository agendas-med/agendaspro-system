<template>
    <section>
        <UtilsDataTable :loaded="true" :dataTable="services" :rowsPerPage="7" table="serviço" @handleNew="newService"
            :newButton="true">
            <template #column-nome="{ item }">
                <p>{{ item.name }}</p>
            </template>
            <template #column-duração="{ item }">
                <p>{{ $myFunctions.formatDuration(item.duration) }}h</p>
            </template>
            <template #column-observações="{ item }">
                <p>{{ item.observations }}</p>
                <span v-if="item.requires_location === 1" style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                    <font-awesome icon="location-dot" /> Em Domicílio
                </span>
            </template>
            <template #column-valor="{ item }">
                <p>{{ $myFunctions.formatCurrency(item.value) }}</p>
            </template>
            <template #column-custo="{ item }">
                <p>{{ $myFunctions.formatCurrency(item.cost) }}</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" aria-label="Editar" title="Editar" v-on:click="handleEditService(item)">
                        <font-awesome icon="pen" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" aria-label="Excluir" title="Excluir" v-on:click="handleDeleteService(item)">
                        <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
        <UtilsModal excludepath="/companies/services/" @closeModal="$myFunctions.closeModal($.proxy);"
            @excluded="$myFunctions.getCompany($.proxy)">
            <ModalContentConfigServicos
                @savedContent="$myFunctions.closeModal($.proxy, []); $myFunctions.getCompany($.proxy)" />
        </UtilsModal>
    </section>
</template>

<script>
export default {
    data() {
        return {
            response: "",
            responseType: ""
        }
    },
    computed: {
        services: function () {
            return this.$global.company.services;
        }
    },
    methods: {
        newService: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar serviço",
                saveButton: "Criar",
                cancelButton: "Cancelar"
            });
        },
        handleEditService: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Editar serviço",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        handleDeleteService: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Excluir serviço",
                saveButton: "Excluir",
                cancelButton: "Cancelar",
                contentObject: item
            });
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Serviços' })
</script>
