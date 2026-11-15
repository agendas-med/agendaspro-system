<template>
    <section>
        <UtilsDataTable :loaded="!loading" :dataTable="users" :rowsPerPage="7" table="usuário" @handleNew="newUser"
            :newButton="true">
            <template #column-nome="{ item }">
                <p>{{ item.name }}</p>
            </template>
            <template #column-status="{ item }">
                <p>{{ item.status }}</p>
            </template>
            <template #column-email="{ item }">
                <p>{{ item.email }}</p>
            </template>
            <template #column-cargo="{ item }">
                <p>{{ item.roleName }}</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2" v-if="item.id != null && item.id != $global.user.id">
                    <button type="button" class="rounded-button" aria-label="Editar usuário" title="Editar usuário" v-on:click="handleEditUser(item)">
                        <font-awesome icon="user-pen" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" aria-label="Excluir" title="Excluir" v-on:click="handleExcludeUser(item)">
                        <font-awesome icon="trash-can" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
        <UtilsModal excludepath="/companies/remove_user/" @closeModal="$myFunctions.closeModal($.proxy); returnUsers();">
            <ModalContentConfigUsuarios @savedContent="$myFunctions.closeModal($.proxy, []); returnUsers();" />
        </UtilsModal>
    </section>
</template>

<script>
export default {
    emits: ["savedContent"],
    data() {
        return {
            response: "",
            responseType: "",
            loading: true,
            users: []
        }
    },
    mounted() {
        this.returnUsers();
    },
    methods: {
        newUser: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar usuário",
                saveButton: "Criar",
                cancelButton: "Cancelar"
            });
        },
        handleEditUser: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Editar usuário",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        handleExcludeUser: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Excluir usuário",
                saveButton: "Excluir",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        returnUsers: function () {
            let self = this;

            self.loading = true;

            self.$base.api.get("/companies/return_users", self.usuario).then((response) => {
                self.users = response.data.returnObj;
                self.$emit("savedContent");
            }).catch((error) => {
                self.$myFunctions.notifyError(self, error, "Não foi possível carregar os usuários")
            }).then(() => {
                self.loading = false;
            })
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Usuários' })
</script>
