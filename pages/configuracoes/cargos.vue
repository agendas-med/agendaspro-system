<template>
    <section>
        <UtilsDataTable :loaded="true" :dataTable="roles" :rowsPerPage="7" table="cargo" @handleNew="newRole"
            :newButton="true">
            <template #column-nome="{ item }">
                <p>{{ item.name }}</p>
            </template>
            <template #column-permissão="{ item }">
                <p>{{ item.permission == 1 ? "Sim" : "Não" }}</p>
            </template>
            <template #column-data-de-criação="{ item }">
                <p>{{ $myFunctions.formatDate(item.create_date) }}</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" aria-label="Editar" title="Editar" v-on:click="handleEditRole(item)">
                        <font-awesome icon="pen" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" aria-label="Excluir" title="Excluir" v-on:click="handleDeleteRole(item)">
                        <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
        <UtilsModal excludepath="/companies/roles/" @closeModal="$myFunctions.closeModal($.proxy);"
            @excluded="$myFunctions.getCompany($.proxy)">
            <ModalContentConfigCargos
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
        roles: function () {
            return this.$global.company.roles;
        }
    },
    methods: {
        newRole: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar cargo",
                saveButton: "Criar",
                cancelButton: "Cancelar"
            });
        },
        handleEditRole: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Editar cargo",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        handleDeleteRole: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Excluir cargo",
                saveButton: "Excluir",
                cancelButton: "Cancelar",
                contentObject: item
            });
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Cargos' })
</script>
