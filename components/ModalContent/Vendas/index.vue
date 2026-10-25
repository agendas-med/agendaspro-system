<template>
  <form
    id="informations-form"
    @submit.prevent="saveSale"
    :invalid="invalidForm"
  >
    <div class="edit-event grid grid-cols-1 gap-4">
      <div class="input-group">
        <label>Cliente</label
        ><UtilsAjaxAutocomplete
          @select="setUser"
          ajaxtype="clientes"
          :entityid="sale.customer_id"
          :entityname="sale.customer_name"
          :required="true"
        />
      </div>
      <div class="input-group">
        <label
          >Serviços
          <font-awesome
            icon="circle-info"
            class="cinza"
            title="Os serviços são incluídos no agendamento vinculado."
        /></label>
        <div class="flex gap-6 flex-wrap items-center">
          <router-link
            v-if="sale.appointment_id"
            :to="'/agenda?appointment=' + sale.appointment_id"
            >Agendamento Nº {{ sale.appointment_id }}</router-link
          ><UtilsBadge
            v-for="service in sale.services"
            :key="service.id"
            :text="service.name"
          />
          <p v-if="!sale.services?.length" class="mt-2 cinza">
            Nenhum agendamento vinculado a esta venda
          </p>
        </div>
      </div>
      <div class="input-group">
        <div class="dual-input half confirm-button" v-if="!locked">
          <div class="input-group">
            <label for="sale-product">Adicione um produto</label
            ><select id="sale-product" v-model="idProductToAdd">
              <option value="">* Selecione *</option>
              <option
                v-for="product in $global.company.products"
                :key="product.id"
                :value="product.id"
              >
                {{ product.name }} ({{
                  product.available_quantity > 0
                    ? "Disponível"
                    : "Indisponível"
                }})
              </option>
            </select>
          </div>
          <div class="input-group">
            <label for="sale-product-quantity">Quantidade</label
            ><input
              id="sale-product-quantity"
              type="number"
              min="1"
              step="1"
              v-model="quantityProductToAdd"
            />
          </div>
          <button type="button" class="btn btn-primary" @click="addProduct">
            Adicionar
          </button>
        </div>
        <UtilsDataTable
          :loaded="true"
          :dataTable="sale.products"
          :rowsPerPage="3"
          table="produto"
          :newButton="false"
          ><template #column-id="{ item }"
            ><p>{{ item.id }}</p></template
          ><template #column-nome="{ item }"
            ><p>{{ item.name }}</p></template
          ><template #column-quantidade="{ item }"
            ><p>{{ item.quantity }}</p></template
          ><template #column-ações="{ item }"
            ><button
              v-if="!locked"
              type="button"
              class="rounded-button"
              :aria-label="'Remover ' + item.name"
              @click="handleDeleteProduct(item)"
            >
              <font-awesome icon="trash" class="vermelho" /></button></template
        ></UtilsDataTable>
      </div>
      <div class="input-group">
        <label for="sale-status">Status</label
        ><select id="sale-status" v-model="sale.status" :disabled="locked">
          <option value="em_aberto">Em aberto</option>
          <option value="realizada">Realizada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
      <div class="sale-summary" v-if="sale.id">
        <p class="fontsize-md-bold">Resumo da venda</p>
        <table>
          <thead>
            <tr>
              <th class="text-left">Item</th>
              <th class="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in previewItems" :key="index">
              <td>{{ item.name }}</td>
              <td class="text-right">
                {{ $myFunctions.formatCurrency(item.value) }}
              </td>
            </tr>
          </tbody>
        </table>
        <table class="sale-subtotal">
          <tbody>
            <tr>
              <td><strong>Total</strong></td>
              <td class="text-right">
                {{ $myFunctions.formatCurrency(previewTotal) }}
              </td>
            </tr>
            <tr>
              <td>Total pago</td>
              <td class="text-right paid-amount">
                {{ $myFunctions.formatCurrency(totalPaid) }}
              </td>
            </tr>
            <tr>
              <td><strong>Restante a pagar</strong></td>
              <td
                class="text-right"
                :class="remainingAmount > 0 ? 'due-amount' : 'paid-amount'"
              >
                <strong>{{
                  remainingAmount > 0
                    ? $myFunctions.formatCurrency(remainingAmount)
                    : "PAGO"
                }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <UtilsDataTable
          :loaded="true"
          :dataTable="sale.payments"
          :rowsPerPage="3"
          table="pagamento"
          :newButton="false"
          ><template #column-id="{ item }"
            ><p>{{ item.id }}</p></template
          ><template #column-método-pagamento="{ item }"
            ><p>{{ retornaMetodo(item.payment_type) }}</p></template
          ><template #column-valor="{ item }"
            ><p>{{ $myFunctions.formatCurrency(item.amount) }}</p></template
          ><template #column-ações
            ><span class="paid-amount">Confirmado</span></template
          ></UtilsDataTable
        >
        <button
          class="btn btn-blue"
          id="insert-payment-button"
          type="button"
          @click="openPaymentModal"
          :disabled="
            preparingPayment ||
            sale.status !== 'em_aberto' ||
            remainingAmount <= 0
          "
        >
          {{
            preparingPayment
              ? "Preparando…"
              : sale.mp_charge_id || sale.pix_asaas_id
                ? "Acompanhar Pix"
                : "Receber pagamento"
          }}
        </button>
      </div>
    </div>
    <input type="submit" id="submit-button" /><input
      type="submit"
      id="submit-button2"
    />
  </form>
  <PaymentsSalePayment
    v-if="showPaymentModal"
    :sale="sale"
    @updated-sale="updateSale"
    @close="showPaymentModal = false"
  />
</template>

<script>
import { reactive } from "vue";
export default {
  emits: ["savedContent"],
  data() {
    return {
      invalidForm: true,
      idProductToAdd: "",
      quantityProductToAdd: 1,
      showPaymentModal: false,
      preparingPayment: false,
      originalSignature: "",
      newSale: {
        id: null,
        products: [],
        services: [],
        customer_id: null,
        customer_name: "",
        company_id: this.$global.company.id,
        appointment_id: null,
        status: "em_aberto",
      },
    };
  },
  computed: {
    sale() {
      return reactive(
        this.$global.contentObject.id
          ? this.$global.contentObject
          : this.newSale,
      );
    },
    previewItems() {
      return [...(this.sale.products || []), ...(this.sale.services || [])].map(
        (item) => ({
          name:
            Number(item.quantity || 1) > 1
              ? `${item.name} (x${item.quantity})`
              : item.name,
          value: Number(item.value) * Number(item.quantity || 1),
        }),
      );
    },
    previewTotal() {
      return (
        Math.round(
          this.previewItems.reduce((sum, item) => sum + item.value, 0) * 100,
        ) / 100
      );
    },
    totalPaid() {
      return (this.sale.payments || []).reduce(
        (total, payment) => total + Number(payment.amount),
        0,
      );
    },
    remainingAmount() {
      return Math.max(
        0,
        Math.round((this.previewTotal - this.totalPaid) * 100) / 100,
      );
    },
    locked() {
      return (
        this.sale.status === "realizada" ||
        !!this.sale.mp_charge_id ||
        !!this.sale.pix_asaas_id
      );
    },
  },
  mounted() {
    this.originalSignature = this.signature();
  },
  methods: {
    signature() {
      return JSON.stringify([
        this.sale.customer_id,
        this.sale.status,
        this.sale.products.map((product) => [
          product.id,
          Number(product.quantity),
        ]),
      ]);
    },
    payload(status = this.sale.status) {
      return {
        company_id: this.sale.company_id,
        customer_id: this.sale.customer_id,
        appointment_id: this.sale.appointment_id || null,
        status,
        products: this.sale.products.map((product) => ({
          id: product.id,
          quantity: Number(product.quantity),
        })),
      };
    },
    updateSale(updated) {
      Object.assign(this.sale, updated);
      this.originalSignature = this.signature();
      if (updated.status === "realizada") {
        this.$global.modalUtils.modalSaveButton = "";
        this.$global.modalUtils.modalSaveButton2 = "";
        this.$global.modalUtils.modalCancelButton = "Fechar";
      }
    },
    async openPaymentModal() {
      if (this.preparingPayment) return;
      this.preparingPayment = true;
      try {
        if (!this.locked && this.signature() !== this.originalSignature)
          await this.$base.api.patch(`/sales/${this.sale.id}`, this.payload());
        const updated = (await this.$base.api.get(`/sales/${this.sale.id}`))
          .data.returnObj;
        this.updateSale(updated);
        this.showPaymentModal = true;
      } catch (error) {
        this.$myFunctions.showFeedbackModal(
          this,
          "Não foi possível abrir o pagamento",
          error.response?.data?.message ||
            error.response?.data ||
            "Salve a venda e tente novamente.",
          "error",
        );
      } finally {
        this.preparingPayment = false;
      }
    },
    retornaMetodo(value) {
      return (
        {
          pix_mercadopago: "Pix Mercado Pago",
          pix_asaas: "Pix Asaas",
          pix: "Pix manual",
          cartao_debito: "Cartão de débito",
          cartao_credito: "Cartão de crédito",
          dinheiro: "Dinheiro",
        }[value] || value
      );
    },
    addProduct() {
      if (!this.idProductToAdd || this.locked) return;
      const product = this.$global.company.products.find(
        (item) => item.id == this.idProductToAdd,
      );
      const existing = this.sale.products.find(
        (item) => item.id === product.id,
      );
      const quantity =
        Number(this.quantityProductToAdd) + Number(existing?.quantity || 0);
      const available = Number(
        existing?.available_quantity ?? product.available_quantity,
      );
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
        this.$myFunctions.showFeedbackModal(
          this,
          "Atenção",
          "Quantidade inválida ou superior ao estoque disponível.",
          "warning",
        );
        return;
      }
      if (existing) existing.quantity = quantity;
      else
        this.sale.products = [...this.sale.products, { ...product, quantity }];
      this.idProductToAdd = "";
      this.quantityProductToAdd = 1;
    },
    handleDeleteProduct(product) {
      if (!this.locked)
        this.sale.products.splice(
          this.sale.products.findIndex((item) => item.id === product.id),
          1,
        );
    },
    setUser(customer) {
      if (!this.locked) {
        this.sale.customer_id = customer.id;
        this.sale.customer_name = customer.name;
      }
    },
    async saveSale(event) {
      if (!this.$myFunctions.formCustomValidate(this)) {
        this.$myFunctions.stopModalLoading(this);
        return;
      }
      try {
        if (this.sale.id)
          await this.$base.api.patch(
            `/sales/${this.sale.id}${event?.submitter?.id === "submit-button2" ? "?finish=true" : ""}`,
            this.payload(),
          );
        else await this.$base.api.post("/sales", this.payload());
        await this.$myFunctions.getCompany(this);
        this.$emit("savedContent");
        this.$myFunctions.showFeedbackModal(
          this,
          "Sucesso",
          this.sale.id
            ? "Venda atualizada com sucesso."
            : "Venda registrada com sucesso.",
          "success",
        );
      } catch (error) {
        this.$myFunctions.stopModalLoading(this);
        this.$myFunctions.showFeedbackModal(
          this,
          "Erro",
          error.response?.data?.message ||
            error.response?.data ||
            "Não foi possível salvar a venda.",
          "error",
        );
      }
    },
  },
};
</script>

<style scoped>
.sale-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sale-summary table {
  width: 100%;
}
.sale-summary table td,
.sale-summary th {
  padding: 6px 0;
  font-size: 13px;
}
.sale-subtotal {
  border-top: 1px solid #e6eae2;
  padding-top: 12px;
}
.paid-amount {
  color: #568746;
}
.due-amount {
  color: #bf5960;
}
#insert-payment-button {
  align-self: flex-end;
  width: auto;
  min-width: 180px;
  margin-top: 8px;
}
</style>
