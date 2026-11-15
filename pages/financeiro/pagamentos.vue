<template>
    <section>
        <UtilsDataTable :loaded="!loading" :dataTable="pagamentos" :rowsPerPage="7" table="cliente"
            :error="loadError" emptyText="Nenhum pagamento encontrado." @retry="returnPayments">
            <template #column-cliente="{ item }">
                <div class="flex items-center">
                    <img :src="item.customer_image" class="avatar avatar-pp" alt="">
                    <div>
                        <p><strong>{{ item.customer_name }}</strong></p>
                    </div>
                </div>
            </template>
            <template #column-telefone="{ item }">
                <p>{{ $myFunctions.formatTel(item.customer_tel) }}</p>
            </template>
            <template #column-data-vencimento="{ item }">
                <p>{{ $myFunctions.formatDate(item.due_date) }}</p>
            </template>
            <template #column-status="{ item }">
                <p class="tag" :class="chooseTagClass(item.status)">{{ item.status }}</p>
            </template>
            <template #column-valor="{ item }">
                <p>{{ $myFunctions.formatCurrency(item.value) }}</p>
            </template>
        </UtilsDataTable>
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
            pagamentos: []
        }
    },
    computed: {
        user: function () {
            return reactive(JSON.parse(JSON.stringify(this.$global.user)));
        }
    },
    mounted() {
        this.returnPayments();
    },
    methods: {
        chooseTagClass: function (status) {
            switch (status) {
                case "Atrasado":
                    return "red";
                case "Em Aberto":
                    return "yellow";
                case "Pago":
                    return "green";
            }
        },
        returnPayments: function () { //Método para retornar os pagamentos
            this.loadError = "";

            this.$base.api.get("/financial").then((response) => {
                this.pagamentos = response.data.returnObj || [];
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os pagamentos");
                this.$myFunctions.notifyError(this, error, "Não foi possível carregar os pagamentos");
            }).then(() => {
                this.loading = false;
            })
        }
    }
}
</script>
<style scoped>
.profile-header {
    margin: var(--space-7) 0;
}

.profile-informations > p {
    margin-bottom: var(--space-3);
}

.avatar {
    margin-right: var(--space-6);
}

@media (max-width: 768px) {
    .profile-configurations {
        & button[type="submit"], & button[type="button"] {
            width: 100%;
            max-width: 100%;
        }
    } 
}
</style>

<script setup>
definePageMeta({ access: 'admin', title: 'Pagamentos' })
</script>
