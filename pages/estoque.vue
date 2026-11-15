<template>
    <section>
        <UtilsPageheader title="Estoque" subtitle="Gerencie os produtos em estoque" />
        <br>
        <UtilsDataTable :loaded="!loading" :dataTable="estoque" :rowsPerPage="7" table="produto"
            :error="loadError" emptyText="Nenhum produto em estoque ainda. Cadastre produtos em Configurações e registre a primeira movimentação."
            @retry="returnStock" newButtonText="Inserir movimentação" @handleNew="newMovement" :newButton="true">
            <template #column-produto="{ item }">
                <p>{{ item.produto }}</p>
            </template>
            <template #column-status="{ item }">
                <p class="tag" :class="chooseTagClass(item.status)">{{ item.status }}</p>
            </template>
            <template #column-quantidade-em-estoque="{ item }">
                <p>{{ item.quantidade }}</p>
            </template>
        </UtilsDataTable>
        <UtilsModal @closeModal="$myFunctions.closeModal($.proxy);">
            <ModalContentEstoque @savedContent="$myFunctions.closeModal($.proxy, []); returnStock()" />
        </UtilsModal>
    </section>
</template>
<script>
export default {
    data() {
        return {
            response: "",
            responseType: "",
            loading: true,
            loadError: "",
            estoque: []
        }
    },
    mounted() {
        this.returnStock();
    },
    methods: {
        newMovement: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Inserir movimentação",
                saveButton: "Inserir",
                cancelButton: "Cancelar"
            });
        },
        chooseTagClass: function (status) {
            switch (status) {
                case "Vazio":
                    return "red";
                case "Normal":
                    return "green";
            }
        },
        returnStock: function () {
            this.loading = true;
            this.loadError = "";

            this.$base.api.get("/stock").then((response) => {
                this.estoque = response.data.returnObj || [];
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar o estoque");
                this.$myFunctions.notifyError(this, error, "Não foi possível carregar o estoque");
            }).then(() => {
                this.loading = false;
            })
        }
    }
}
</script>
<style scoped></style>

<script setup>
definePageMeta({ access: 'member', title: 'Estoque' })
</script>
