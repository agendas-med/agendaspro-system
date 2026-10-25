<template>
  <section class="receivings-page">
    <div v-if="$route.query.welcome" class="welcome-note">
      <span class="welcome-check">✓</span>
      <div>
        <strong>Sua empresa está pronta.</strong>
        <p>Conecte o Mercado Pago para começar a receber.</p>
      </div>
    </div>
    <div class="receivings-heading">
      <div>
        <p class="eyebrow">SEU FINANCEIRO CONECTADO</p>
        <h2>Recebimentos</h2>
        <p>Escolha onde receber e acompanhe os pagamentos da sua empresa.</p>
      </div>
      <span v-if="configuration?.environment === 'test'" class="test-badge"
        >Ambiente de teste</span
      >
    </div>
    <p v-if="connectionMessage" class="callback-message" role="status">
      {{ connectionMessage }}
    </p>
    <PaymentsConnectedAccount
      v-if="configuration"
      :settings="configuration"
      @changed="loadAll"
    />
    <PaymentsPlans
      v-if="configuration?.plan"
      :settings="configuration"
      @changed="loadAll"
    />
    <div class="receivings-notes">
      <p>
        <strong>Como funciona</strong> Seu cliente paga pelo Mercado Pago. A
        comissão é separada automaticamente e o restante vai para sua conta
        Mercado Pago, conforme os prazos e as tarifas do provedor.
      </p>
      <p v-if="configuration">
        <strong
          >Comissão AgendasPro:
          {{
            (configuration.commission_bps / 100).toLocaleString("pt-BR")
          }}%</strong
        >
        As tarifas do meio de pagamento são consideradas no valor líquido.
      </p>
    </div>
    <div v-if="configuration?.environment === 'test'" class="test-note">
      Você está no ambiente de teste. Os pagamentos são simulados e não
      movimentam dinheiro real.
    </div>
    <div class="transactions-heading">
      <div>
        <h3>Recebimentos recentes</h3>
        <p>Acompanhe os pagamentos e a comissão aplicada em cada venda.</p>
      </div>
      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        @click="loadCharges"
      >
        {{ loading ? "Atualizando…" : "↻ Atualizar" }}
      </button>
    </div>
    <p v-if="error" class="transactions-error" role="alert">{{ error }}</p>
    <div v-else-if="!loading && !charges.length" class="empty-receivings">
      <span aria-hidden="true">↙</span>
      <h4>Seu próximo recebimento aparece aqui</h4>
      <p>Gere uma cobrança em uma venda para acompanhar o pagamento.</p>
      <NuxtLink to="/vendas">Ir para vendas →</NuxtLink>
    </div>
    <div v-else class="transactions-scroll">
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Cliente / venda</th>
            <th>Data</th>
            <th>Valor</th>
            <th>Pagamento</th>
            <th>Comissão AgendasPro</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="charge in charges" :key="charge.id">
            <td>
              <strong>{{ charge.customer_name }}</strong
              ><span>Venda #{{ charge.sale_id }}</span>
            </td>
            <td>{{ formatDate(charge.created_at) }}</td>
            <td class="money">{{ money(charge.amount) }}</td>
            <td>
              <span
                class="state-badge"
                :class="charge.status === 'approved' ? 'approved' : ''"
                >{{ paymentLabel(charge.status) }}</span
              >
            </td>
            <td>
              <span>{{
                charge.api === "checkout" ? money(charge.commission) : "—"
              }}</span>
              <small>{{
                charge.api === "checkout"
                  ? `${charge.commission_bps / 100}% · ${charge.plan === "premium" ? "Premium" : "Gratuito"}`
                  : "Pagamento anterior ao split"
              }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script>
export default {
  data: () => ({ configuration: null, charges: [], loading: true, error: "" }),
  computed: {
    connectionMessage() {
      if (this.$route.query.connection === "failed")
        return "Não foi possível concluir a conexão. Tente conectar novamente pelo botão abaixo.";
      if (this.$route.query.connection === "success")
        return String(this.$route.query.company) ===
          String(this.$global.selectedCompany?.id)
          ? "Conta Mercado Pago conectada com sucesso."
          : "Conta conectada. Selecione a empresa que iniciou a conexão para consultá-la.";
      if (this.$route.query.subscription === "return")
        return "Autorização recebida. O Premium depende da confirmação do pagamento pelo Mercado Pago.";
      return "";
    },
  },
  mounted() {
    this.loadAll();
  },
  methods: {
    async loadAll() {
      try {
        this.configuration = (
          await this.$base.api.get("/payments/mercadopago/status")
        ).data;
        Object.assign(this.$global.paymentStatus, this.configuration);
        await this.loadCharges();
      } catch {
        this.error =
          "Não foi possível carregar os recebimentos. Atualize para tentar novamente.";
        this.loading = false;
      }
    },
    money(value) {
      return this.$myFunctions.formatCurrency(value);
    },
    formatDate(value) {
      return new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    },
    paymentLabel(status) {
      return (
        {
          creating: "Gerando Pix",
          creation_failed: "Criação recusada",
          pending: "Aguardando Pix",
          in_process: "Em análise",
          approved: "Confirmado",
          cancelled: "Cancelado",
          rejected: "Recusado",
          expired: "Expirado",
          refunded: "Devolvido",
          dispatching: "Criando checkout",
          needs_review: "Revisão necessária",
          in_mediation: "Em revisão",
        }[status] || status
      );
    },
    async loadCharges() {
      this.loading = true;
      this.error = "";
      try {
        this.charges = (
          await this.$base.api.get("/payments/mercadopago/charges")
        ).data;
      } catch {
        this.error =
          "Não foi possível carregar os recebimentos. Tente atualizar.";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.receivings-page {
  max-width: 1050px;
  padding-bottom: 32px;
}
.receivings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 30px 0 24px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.13em;
  font-weight: 700;
  color: #78906d;
}
h2 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.7px;
  color: #1e3527;
  margin: 8px 0;
}
.receivings-heading p:not(.eyebrow),
.transactions-heading p {
  font-size: 13px;
  color: #87917f;
  line-height: 1.6;
}
.test-badge {
  font-size: 11px;
  padding: 7px 12px;
  border: 1px solid #e9d597;
  color: #8d753c;
  background: #fff9e9;
  border-radius: 20px;
  white-space: nowrap;
}
.receivings-notes {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 36px;
  margin: 24px 0;
}
.receivings-notes p {
  color: #87917f;
  font-size: 11px;
  line-height: 1.8;
}
.receivings-notes strong {
  color: #52684b;
  display: block;
  margin-bottom: 3px;
  font-weight: 600;
}
.test-note {
  color: #8b784c;
  font-size: 11px;
  line-height: 1.7;
  padding: 12px 16px;
  background: #fffbf0;
  border-radius: 9px;
}
.transactions-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 36px 0 18px;
}
h3 {
  font-size: 18px;
  font-weight: 600;
  color: #263e2c;
  margin-bottom: 5px;
}
.refresh-button {
  border: 1px solid #e2e8de;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: #657a5c;
  cursor: pointer;
  background: #fff;
}
.empty-receivings {
  border: 1px dashed #dce5d5;
  border-radius: 15px;
  padding: 38px 20px;
  text-align: center;
}
.empty-receivings > span {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #6e965a;
  background: #f1f7eb;
  font-size: 24px;
  margin-bottom: 13px;
}
h4 {
  font-size: 14px;
  font-weight: 600;
  color: #506149;
}
.empty-receivings p {
  font-size: 12px;
  color: #9aa290;
  margin-top: 7px;
}
.empty-receivings a {
  display: inline-block;
  margin-top: 18px;
  font-size: 12px;
  color: #537c3f;
}
.welcome-note {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 18px 20px;
  margin-top: 20px;
  background: #f1f8eb;
  color: #527343;
  border: 1px solid #d9eaca;
  border-radius: 12px;
  font-size: 13px;
}
.welcome-note p {
  font-size: 12px;
  margin-top: 3px;
}
.welcome-check {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #dcedca;
}
.transactions-scroll {
  overflow-x: auto;
  border: 1px solid #e6ebe1;
  border-radius: 12px;
}
.transactions-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-size: 12px;
}
.transactions-table th {
  color: #899480;
  font-weight: 500;
  background: #f9fbf6;
  text-align: left;
  padding: 13px 18px;
}
.transactions-table td {
  padding: 18px;
  border-top: 1px solid #eef1e9;
  color: #6e7b63;
}
.transactions-table td strong {
  display: block;
  color: #33492b;
  font-weight: 600;
}
.transactions-table td:first-child span,
.transactions-table small {
  display: block;
  color: #9ba58e;
  font-size: 10px;
  margin-top: 5px;
}
.money {
  font-weight: 600;
  color: #34492e !important;
  white-space: nowrap;
}
.state-badge {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 20px;
  font-size: 10px;
  background: #fff7df;
  color: #9a7e34;
}
.state-badge.approved {
  color: #50803a;
  background: #eef6e5;
}
.paid-out {
  color: #50803a;
}
.transactions-error {
  color: #ac3540;
  font-size: 12px;
}
@media (max-width: 600px) {
  .receivings-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .receivings-notes {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  h2 {
    font-size: 25px;
  }
}
</style>
