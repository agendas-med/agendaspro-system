<template>
<div>
  <UtilsPageheader title="Vendas" subtitle="Gerencie as vendas realizadas no estabelecimento." />
  <br>
  <UtilsDataTable :loaded="!loading" :dataTable="vendas" :rowsPerPage="7" :newButton="true" @handleNew="newSale"
    :error="loadError" emptyText="Nenhuma venda registrada ainda. Registre a primeira venda do estabelecimento."
    @retry="returnSales" table="venda">
    <template #column-cliente="{ item }">
      <div class="flex items-center">
        <img :src="item.customer_image == '' ? defaultUserImage : $myFunctions.fileUrl(item.customer_image)"
          class="avatar avatar-pp" alt="">
        <div>
          <p><strong>{{ item.customer_name }}</strong></p>
        </div>
      </div>
    </template>
    <template #column-serviços="{ item }">
      <p v-if="item.services.length">{{ item.services[0].name }} {{ item.services.length > 1 ? ("+ " +
        (item.services.length - 1)) : "" }}</p>
    </template>
    <template #column-produtos="{ item }">
      <p v-if="item.products.length">{{ item.products[0].name }} {{ item.products.length > 1 ? ("+ " +
        (item.products.length - 1)) : "" }}</p>
    </template>
    <template #column-total="{ item }">
      <p>{{ $myFunctions.formatCurrency(item.total) }}</p>
    </template>
    <template #column-status="{ item }">
      <UtilsBadge class="text-center"
        :background="item.status == 'realizada' ? 'var(--verde)' : item.status == 'em_aberto' ? 'var(--amarelo)' : 'var(--vermelho)'"
        :text="returnSaleStatus(item.status)" />
    </template>
    <template #column-data="{ item }">
      <p>{{ $myFunctions.formatDate(item.create_date) }}</p>
    </template>
    <template #column-ações="{ item }">
      <div class="flex space-x-2">
        <button type="button" class="rounded-button" aria-label="Excluir venda" title="Excluir venda" v-on:click="handleDeleteSale(item)">
          <font-awesome icon="trash" class="vermelho" aria-hidden="true" />
        </button>
        <button type="button" class="rounded-button" aria-label="Editar venda" title="Editar venda" v-on:click="handleEditSale(item)">
          <font-awesome icon="pen" class="cinza" aria-hidden="true" />
        </button>
      </div>
    </template>
  </UtilsDataTable>
  <UtilsModal excludepath="/sales/" @closeModal="$myFunctions.closeModal($.proxy); returnSales()">
    <ModalContentVendas :event="selectedEvent" @savedContent="$myFunctions.closeModal($.proxy, []); returnSales()" />
  </UtilsModal>
</div>
</template>
<script>
import defaultUserImage from '@/assets/img/default-user-image.png';

export default {
  data() {
    return {
      defaultUserImage: defaultUserImage,
      loading: true,
      loadError: "",
      modalContentVendas: false,
      vendas: []
    }
  },
  computed: {

  },
  mounted: function () {
    this.returnSales();
  },
  methods: {
    returnSaleStatus: function (status) {
      switch (status) {
        case "em_aberto":
          return "Em aberto";
        case "realizada":
          return "Realizada";
        case "cancelada":
          return "Cancelada";
      }
    },
    returnSales: function () {
      this.loadError = "";

      this.$base.api.get("/sales").then((response) => {
        this.vendas = response.data.returnObj || [];
      }).catch((error) => {
        this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar as vendas");
        this.$myFunctions.notifyError(this, error, "Não foi possível carregar as vendas");
      }).then(() => {
        this.loading = false;
      })
    },
    handleEditSale: function (item) {
      this.$myFunctions.openModal({
        instance: this,
        title: "Alterar venda",
        saveButton: item.status === 'realizada' ? '' : "Salvar",
        saveButton2: item.status === 'realizada' ? '' : "Finalizar",
        cancelButton: "Cancelar",
        contentObject: item
      });
    },
    handleDeleteSale: function (item) {
      this.$myFunctions.openModal({
        instance: this,
        title: "Excluir venda",
        saveButton: "Excluir",
        cancelButton: "Cancelar",
        contentObject: item
      });
    },
    newSale: function () {
      this.$myFunctions.openModal({
        instance: this,
        title: "Incluir venda",
        saveButton: "Cadastrar",
        cancelButton: "Cancelar"
      });
    }
  }
}
</script>
<style></style>

<script setup>
definePageMeta({ access: 'member', title: 'Vendas' })
</script>
