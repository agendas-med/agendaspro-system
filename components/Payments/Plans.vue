<template>
  <section class="plans">
    <div class="plan-heading">
      <div>
        <p class="eyebrow">UMA ESCOLHA PARA O SEU NEGÓCIO</p>
        <h3>Seu plano de recebimentos</h3>
      </div>
      <span>Por empresa</span>
    </div>
    <div class="plan-grid">
      <article
        v-for="plan in settings.plan.catalog"
        :key="plan.code"
        class="plan-card"
        :class="{
          premium: plan.code === 'premium',
          selected: plan.code === current.code,
        }"
      >
        <div class="plan-title">
          <h4>{{ plan.name }}</h4>
          <span v-if="plan.code === current.code" class="current-badge"
            >Seu plano</span
          ><span v-else-if="plan.code === 'premium'" class="premium-badge"
            >Menor comissão</span
          >
        </div>
        <p class="plan-price">
          {{ plan.monthly_price ? "R$ 49,90" : "R$ 0" }}<span>/mês</span>
        </p>
        <p class="plan-fee">
          <strong>{{ plan.commission_bps / 100 }}%</strong> por pagamento online
        </p>
        <p class="plan-description">
          {{
            plan.code === "free"
              ? "Sem mensalidade. Pague quando receber."
              : "Mais economia para quem recebe todos os meses."
          }}
        </p>
        <button
          v-if="plan.code === 'premium' && current.code !== 'premium'"
          class="primary"
          :disabled="!isAdmin || busy"
          @click="checkout = true"
        >
          {{ pending ? "Concluir assinatura" : "Assinar Premium" }}
        </button>
        <span v-else class="plan-included">{{
          plan.code === current.code
            ? "Plano atual"
            : "Disponível ao encerrar o Premium"
        }}</span>
      </article>
    </div>
    <div class="fee-note">
      <strong>Transparência em cada pagamento.</strong> A comissão do AgendasPro
      é calculada sobre o valor pago pelo cliente. As tarifas do Mercado Pago
      são adicionais e seguem as condições da sua conta.
    </div>
    <div v-if="current.paid_until" class="subscription-info">
      <span
        >Premium pago até {{ date(current.paid_until) }}.<template
          v-if="subscription?.status === 'cancelled'"
        >
          Renovação cancelada. Depois dessa data, você volta ao
          Gratuito.</template
        ></span
      ><button
        v-if="isAdmin && subscription?.status !== 'cancelled'"
        class="text-button"
        :disabled="busy"
        @click="cancelling = true"
      >
        Cancelar renovação
      </button>
    </div>
    <p v-if="pending" class="pending-note">
      A assinatura aguarda confirmação do pagamento. A comissão atual continua
      em {{ current.commission_bps / 100 }}%.
    </p>
    <button
      v-if="isAdmin && subscription"
      class="text-button"
      :disabled="busy"
      @click="reconcile"
    >
      {{ busy ? "Verificando…" : "Verificar assinatura" }}
    </button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <PaymentsDialog
      v-if="checkout"
      title="Receba mais com o Premium"
      eyebrow="ASSINATURA MENSAL"
      :busy="busy"
      @close="checkout = false"
    >
      <div class="checkout-summary">
        <span>Mensalidade por empresa</span><strong>R$ 49,90/mês</strong
        ><span>Comissão AgendasPro</span><strong>1% por pagamento</strong>
      </div>
      <p>
        Você continuará no site do Mercado Pago para autorizar a cobrança mensal
        recorrente. O Premium será ativado após a confirmação do primeiro
        pagamento.
      </p>
      <p>
        As tarifas do Mercado Pago são cobradas à parte. Você pode cancelar a
        renovação nas configurações de recebimentos.
      </p>
      <p v-if="!settings.configured" class="pending-note">
        A contratação ficará disponível assim que a conexão com o Mercado Pago
        estiver configurada.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <template #footer
        ><button class="secondary" :disabled="busy" @click="checkout = false">
          Agora não</button
        ><button
          class="primary"
          :disabled="busy || !settings.configured"
          @click="subscribe"
        >
          {{ busy ? "Preparando…" : "Continuar para assinatura →" }}
        </button></template
      >
    </PaymentsDialog>
    <PaymentsDialog
      v-if="cancelling"
      title="Cancelar a renovação?"
      eyebrow="PLANO PREMIUM"
      :busy="busy"
      @close="cancelling = false"
      ><p>
        Seu Premium continua até o fim do período pago. Depois disso, a
        mensalidade deixa de ser cobrada e as novas transações passam a ter
        comissão de 5%.
      </p>
      <template #footer
        ><button class="secondary" :disabled="busy" @click="cancelling = false">
          Manter Premium</button
        ><button class="primary" :disabled="busy" @click="cancel">
          Cancelar renovação
        </button></template
      ></PaymentsDialog
    >
  </section>
</template>
<script>
export default {
  props: { settings: { type: Object, required: true } },
  emits: ["changed"],
  data: () => ({ busy: false, error: "", checkout: false, cancelling: false }),
  computed: {
    current() {
      return this.settings.plan.current;
    },
    subscription() {
      return this.settings.plan.subscription;
    },
    isAdmin() {
      return this.$global.user?.permission == 1;
    },
    pending() {
      return (
        this.subscription &&
        ["creating", "pending", "authorized"].includes(
          this.subscription.status,
        ) &&
        this.current.code !== "premium"
      );
    },
  },
  methods: {
    date(value) {
      return new Date(value).toLocaleDateString("pt-BR");
    },
    async subscribe() {
      this.busy = true;
      this.error = "";
      try {
        const { data } = await this.$base.api.post(
          "/payments/mercadopago/plans/premium",
        );
        const url = new URL(data.subscription?.checkout_url);
        if (
          url.protocol !== "https:" ||
          !/(^|\.)mercadopago\.com\.br$/.test(url.hostname)
        )
          throw new Error();
        window.location.assign(url.href);
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível preparar a assinatura. Tente novamente.";
        this.busy = false;
      }
    },
    async reconcile() {
      this.busy = true;
      this.error = "";
      try {
        await this.$base.api.post(
          `/payments/mercadopago/plans/${this.subscription.id}/reconcile`,
        );
        this.$emit("changed");
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível verificar a assinatura.";
      } finally {
        this.busy = false;
      }
    },
    async cancel() {
      this.busy = true;
      this.error = "";
      try {
        await this.$base.api.post(
          `/payments/mercadopago/plans/${this.subscription.id}/cancel`,
        );
        this.cancelling = false;
        this.$emit("changed");
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível cancelar a renovação.";
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>
<style scoped>
.plans {
  margin: 34px 0;
}
.plan-heading,
.plan-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #8b9690;
  margin: 0 0 8px;
}
.plan-heading h3 {
  font-size: 19px;
  font-weight: 650;
  margin: 0;
}
.plan-heading > span {
  font-size: 12px;
  color: #859088;
}
.plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin: 20px 0 16px;
}
.plan-card {
  padding: 25px;
  border: 1px solid #e1e7e3;
  border-radius: 17px;
  background: #fff;
}
.plan-card.premium {
  background: linear-gradient(145deg, #fbfcff, #f5f3fd);
  border-color: #d6d0ee;
}
.plan-card.selected {
  box-shadow: 0 0 0 1px #7cae96;
}
.plan-title h4 {
  font-size: 17px;
  font-weight: 650;
  margin: 0;
}
.current-badge,
.premium-badge {
  font-size: 10px;
  border-radius: 20px;
  padding: 5px 9px;
  background: #e5f4ec;
  color: #277c56;
}
.premium-badge {
  background: #eee8fd;
  color: #7657ac;
}
.plan-price {
  font-size: 30px;
  font-weight: 700;
  margin: 24px 0 18px;
  letter-spacing: -0.04em;
}
.plan-price span {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
  color: #86908a;
  margin-left: 5px;
}
.plan-fee {
  font-size: 14px;
  color: #52605a;
}
.plan-fee strong {
  font-size: 23px;
  margin-right: 5px;
  color: #293c31;
}
.plan-description {
  font-size: 12px;
  color: #7b8780;
  margin: 14px 0 25px;
}
.primary,
.secondary {
  padding: 12px 17px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.primary {
  background: #11845f;
  color: #fff;
  border: 1px solid #11845f;
}
.plan-card .primary {
  width: 100%;
  background: #655095;
  border-color: #655095;
}
.secondary {
  background: white;
  border: 1px solid #d5ded7;
  color: #4b6152;
}
.plan-included {
  display: block;
  padding: 12px 0;
  font-size: 12px;
  color: #7c8c82;
}
.fee-note,
.subscription-info,
.pending-note {
  font-size: 12px;
  color: #7c8881;
  line-height: 1.7;
}
.fee-note strong {
  color: #526359;
}
.subscription-info {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-top: 16px;
}
.pending-note {
  color: #9b7834;
  margin-top: 12px;
}
.text-button {
  border: 0;
  background: transparent;
  font-size: 12px;
  color: #486d59;
  padding: 8px 0;
  cursor: pointer;
  text-decoration: underline;
}
.checkout-summary {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 20px;
  background: #f4f7f5;
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 14px;
}
.checkout-summary strong {
  font-weight: 650;
}
.error {
  font-size: 13px;
  color: #b53333;
  margin-top: 12px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button:focus-visible {
  outline: 3px solid #84b79d;
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .plan-grid {
    grid-template-columns: 1fr;
  }
  .plan-card {
    padding: 22px;
  }
  .subscription-info {
    display: block;
  }
}
</style>
