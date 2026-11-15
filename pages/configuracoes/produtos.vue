<template>
    <section>
        <UtilsDataTable :loaded="true" :dataTable="products" :rowsPerPage="7" table="produto" @handleNew="newProduct"
            :newButton="true">
            <template #column-nome="{ item }">
                <p>{{ item.name }}</p>
            </template>
            <template #column-descrição="{ item }">
                <p>{{ item.description }}</p>
            </template>
            <template #column-valor="{ item }">
                <p>{{ $myFunctions.formatCurrency(item.value) }}</p>
            </template>
            <template #column-custo="{ item }">
                <p>{{ $myFunctions.formatCurrency(item.cost) }}</p>
            </template>
            <template #column-unidade-de-medida="{ item }">
                <p>{{ item.unit_of_measure_name }} ({{ item.unit_of_measure_abbreviation }})</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" aria-label="Editar" title="Editar" v-on:click="handleEditProduct(item)">
                        <font-awesome icon="pen" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" aria-label="Excluir" title="Excluir" v-on:click="handleDeleteProduct(item)">
                        <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>
        <UtilsModal excludepath="/companies/products/" @closeModal="$myFunctions.closeModal($.proxy);"
            @excluded="$myFunctions.getCompany($.proxy)">
            <ModalContentConfigProdutos
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
        products: function () {
            return this.$global.company.products;
        }
    },
    methods: {
        newProduct: function () {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar produto",
                saveButton: "Criar",
                cancelButton: "Cancelar"
            });
        },
        handleEditProduct: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Editar produto",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                contentObject: item
            });
        },
        handleDeleteProduct: function (item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Excluir produto",
                saveButton: "Excluir",
                cancelButton: "Cancelar",
                contentObject: item
            });
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Produtos' })
</script>
