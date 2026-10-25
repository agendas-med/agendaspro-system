<template>
  <PaymentsDialog
    title="Receber pagamento"
    :eyebrow="'VENDA #' + sale.id"
    :busy="busy"
    @close="$emit('close')"
  >
    <p v-if="loading" class="muted" role="status">Preparando pagamento…</p>
    <template v-else>
      <div
        v-if="
          configuration?.environment === 'test' &&
          configuration?.provider === 'mercadopago'
        "
        class="sandbox-note"
      >
        Ambiente de teste · nenhum dinheiro real é movimentado.
      </div>
      <div v-if="confirmed" class="payment-success" role="status">
        <span class="success-icon" aria-hidden="true">✓</span>
        <h3>Pagamento confirmado!</h3>
        <p>O recebimento foi registrado na venda.</p>
        <strong>{{ money(confirmedAmount) }}</strong
        ><span class="method-label">{{ methodLabel(confirmedMethod) }}</span>
        <div class="success-details">
          <span>Cliente</span><b>{{ sale.customer_name }}</b
          ><span>Venda</span><b>#{{ sale.id }}</b>
        </div>
      </div>
      <div v-else-if="charge || pix" class="pix-checkout">
        <div class="checkout-total">
          <span>Total a receber</span
          ><strong>{{ money(charge?.amount || amount) }}</strong>
        </div>
        <div v-if="terminal" class="terminal-note">{{ terminal }}</div>
        <template v-else>
          <div v-if="charge?.api === 'checkout'" class="checkout-introduction">
            <h3>Pagamento seguro pelo Mercado Pago</h3>
            <p>
              Abra o checkout para escolher Pix ou cartão. A confirmação
              aparecerá nesta venda automaticamente.
            </p>
            <p>
              Comissão AgendasPro: {{ money(charge.commission) }} ({{
                charge.commission_bps / 100
              }}%). Tarifas do Mercado Pago à parte.
            </p>
          </div>
          <img
            v-if="qrImage"
            :src="qrImage"
            width="204"
            height="204"
            alt="QR Code para pagamento Pix"
            class="pix-qr"
          />
          <div
            v-else-if="charge?.api !== 'checkout'"
            class="qr-loading"
            role="status"
          >
            <span class="spinner"></span>Preparando seu Pix…
          </div>
          <p v-if="charge?.api !== 'checkout'" class="pix-instructions">
            {{
              configuration?.environment === "test"
                ? "Este Pix pertence ao ambiente de teste."
                : "Escaneie o QR Code no app do seu banco ou use o código abaixo."
            }}
          </p>
          <div v-if="pix?.payload" class="pix-code">
            <label for="pix-copy-code">Pix copia e cola</label>
            <div>
              <input id="pix-copy-code" readonly :value="pix.payload" /><button
                type="button"
                @click="copyPix"
              >
                {{ copied ? "Copiado ✓" : "Copiar" }}
              </button>
            </div>
          </div>
          <a
            v-if="safePaymentUrl"
            :href="safePaymentUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="payment-link"
            >{{
              charge?.api === "checkout"
                ? "Abrir checkout do Mercado Pago ↗"
                : "Abrir página do Pix ↗"
            }}</a
          >
          <div class="waiting-status" role="status">
            <span class="spinner"></span>Aguardando confirmação do pagamento
          </div>
          <p class="confirmation-help">
            A confirmação aparece aqui automaticamente.
          </p>
          <button
            v-if="pix?.paymentId || charge?.api === 'checkout'"
            type="button"
            class="cancel-pix"
            :disabled="busy || refreshing"
            @click="cancelPix"
          >
            Encerrar cobrança
          </button>
        </template>
      </div>
      <form v-else id="sale-payment-form" @submit.prevent="submit">
        <div class="balance">
          <span>Saldo da venda</span><strong>{{ money(remaining) }}</strong>
        </div>
        <div v-if="!onlineReady" class="setup-note">
          <p>
            {{
              configuration?.connection
                ? "O recebimento Pix online ainda não está disponível."
                : "Conecte a conta Mercado Pago para receber online."
            }}
          </p>
          <NuxtLink to="/configuracoes/recebimentos" @click="$emit('close')"
            >Configurar recebimentos →</NuxtLink
          >
        </div>
        <label class="field-label" for="sale-payment-method"
          >Forma de pagamento</label
        >
        <select
          id="sale-payment-method"
          v-model="method"
          :disabled="!!intent"
          required
        >
          <option
            value="mercadopago"
            v-if="configuration?.provider !== 'asaas'"
            :disabled="!onlineReady"
          >
            Pix ou cartão · Mercado Pago
          </option>
          <option value="pix_asaas" v-else :disabled="!onlineReady">
            Pix online · Asaas
          </option>
          <option value="pix">Pix com conferência manual</option>
          <option value="dinheiro">Dinheiro</option>
        </select>
        <label class="field-label" for="sale-payment-amount"
          >Valor do pagamento</label
        >
        <div class="amount-field">
          <span>R$</span
          ><input
            id="sale-payment-amount"
            v-model="amount"
            type="number"
            min="0.01"
            step="0.01"
            :max="remaining"
            :readonly="!!intent"
            required
            inputmode="decimal"
          />
        </div>
        <p class="amount-help">
          Você pode receber o saldo inteiro ou informar um pagamento parcial.
        </p>
        <p v-if="intent" class="recovery-note">
          Há uma tentativa em andamento. Ao tentar novamente, reutilizamos a
          mesma cobrança para evitar duplicidade.
        </p>
      </form>
      <p v-if="error" class="payment-error" role="alert">{{ error }}</p>
    </template>
    <template #footer>
      <button
        v-if="confirmed || terminal"
        class="pay-primary"
        type="button"
        @click="$emit('close')"
      >
        Voltar para a venda
      </button>
      <template v-else-if="charge || pix"
        ><button
          type="button"
          class="pay-secondary"
          :disabled="busy || refreshing"
          @click="verify"
        >
          {{ refreshing ? "Consultando…" : "Verificar pagamento" }}</button
        ><button
          type="button"
          class="pay-primary"
          :disabled="busy"
          @click="$emit('close')"
        >
          Continuar depois
        </button></template
      >
      <template v-else
        ><button
          type="button"
          class="pay-secondary"
          :disabled="busy"
          @click="$emit('close')"
        >
          Cancelar</button
        ><button
          type="submit"
          form="sale-payment-form"
          class="pay-primary"
          :disabled="
            loading ||
            busy ||
            ((method === 'mercadopago' || method.includes('_')) && !onlineReady)
          "
        >
          {{
            busy
              ? "Processando…"
              : intent
                ? "Tentar novamente"
                : method === "mercadopago"
                  ? "Gerar checkout"
                  : method.includes("_")
                    ? "Gerar Pix"
                    : "Registrar pagamento"
          }}
        </button></template
      >
    </template>
  </PaymentsDialog>
</template>

<script>
import QRCode from "qrcode";
export default {
  props: { sale: { type: Object, required: true } },
  emits: ["close", "updated-sale"],
  data: () => ({
    loading: true,
    busy: false,
    refreshing: false,
    configuration: null,
    method: "mercadopago",
    amount: 0,
    charge: null,
    pix: null,
    qrImage: "",
    error: "",
    terminal: "",
    confirmed: false,
    confirmedAmount: 0,
    confirmedMethod: "",
    intent: null,
    copied: false,
    pollTimer: null,
    disposed: false,
  }),
  computed: {
    remaining() {
      return Math.max(
        0,
        Math.round(
          (Number(this.sale.total || 0) -
            (this.sale.payments || []).reduce(
              (sum, payment) => sum + Number(payment.amount),
              0,
            )) *
            100,
        ) / 100,
      );
    },
    onlineReady() {
      return this.configuration?.provider === "asaas"
        ? this.$global.company.asaas_status === "APPROVED"
        : !!(this.configuration?.configured && this.configuration?.connection);
    },
    intentKey() {
      return `agendaspro:pix:${this.$global.selectedCompany.id}:${this.sale.id}`;
    },
    safePaymentUrl() {
      try {
        const url = new URL(this.charge?.checkout_url || this.pix?.url);
        return url.protocol === "https:" &&
          /(^|\.)mercadopago\.com\.br$/.test(url.hostname)
          ? url.href
          : "";
      } catch {
        return "";
      }
    },
  },
  async mounted() {
    this.amount = this.remaining;
    try {
      this.configuration = (
        await this.$base.api.get("/payments/mercadopago/status")
      ).data;
      this.method =
        this.configuration.provider === "asaas" ? "pix_asaas" : "mercadopago";
      try {
        this.intent = JSON.parse(sessionStorage.getItem(this.intentKey));
      } catch {
        this.intent = null;
      }
      if (this.intent) this.amount = this.intent.amount;
      if (this.sale.mp_charge_id) {
        await this.readCharge(this.sale.mp_charge_id);
        this.startPolling();
      } else if (this.sale.pix_asaas_id) {
        await this.setPix({
          paymentId: this.sale.pix_asaas_id,
          payload: this.sale.pix_payload,
          encodedImage: this.sale.pix_encoded_image,
        });
        this.startPolling();
      }
    } catch {
      this.error =
        "Não foi possível carregar a configuração de recebimentos. Tente abrir novamente.";
    } finally {
      this.loading = false;
    }
  },
  beforeUnmount() {
    this.disposed = true;
    clearInterval(this.pollTimer);
  },
  methods: {
    money(value) {
      return this.$myFunctions.formatCurrency(value);
    },
    methodLabel(value) {
      return (
        {
          pix_mercadopago: "Pix · Mercado Pago",
          mercadopago: "Mercado Pago",
          pix_asaas: "Pix · Asaas",
          pix: "Pix manual",
          dinheiro: "Dinheiro",
        }[value] || value
      );
    },
    async setPix(pix) {
      this.pix = pix;
      if (pix?.encodedImage)
        this.qrImage = `data:image/png;base64,${pix.encodedImage}`;
      else if (pix?.payload)
        this.qrImage = await QRCode.toDataURL(pix.payload, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: "M",
        });
    },
    async readCharge(id) {
      const charge = (
        await this.$base.api.get(`/payments/mercadopago/charges/${id}`)
      ).data;
      this.charge = charge;
      await this.setPix(charge.pix);
      if (
        (charge.api !== "checkout" &&
          ["cancelled", "rejected", "expired"].includes(charge.status)) ||
        [
          "creation_failed",
          "expired",
          "needs_review",
          "refunded",
          "in_mediation",
        ].includes(charge.status)
      ) {
        this.terminal = {
          cancelled: "Este Pix foi cancelado.",
          rejected: "Este pagamento foi recusado.",
          expired: "Este Pix expirou.",
          needs_review: "Este pagamento precisa de revisão financeira.",
          refunded: "Este pagamento foi devolvido. Consulte os recebimentos.",
          in_mediation: "Este pagamento está em análise pelo Mercado Pago.",
          creation_failed:
            "O Mercado Pago recusou a criação. Confira os dados da empresa e a conexão antes de gerar uma nova cobrança.",
        }[charge.status];
        this.clearIntent();
        clearInterval(this.pollTimer);
      }
    },
    clearIntent() {
      sessionStorage.removeItem(this.intentKey);
      this.intent = null;
    },
    async submit() {
      if (this.busy) return;
      this.error = "";
      const amount = Number(this.intent?.amount ?? this.amount);
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        Math.round(amount * 100) > Math.round(this.remaining * 100)
      ) {
        this.error = "Informe um valor maior que zero e até o saldo da venda.";
        return;
      }
      this.busy = true;
      try {
        if (this.method === "mercadopago" && !this.intent) {
          this.intent = {
            key: crypto.randomUUID(),
            amount,
            sale_id: this.sale.id,
            customer_id: this.sale.customer_id,
          };
          sessionStorage.setItem(this.intentKey, JSON.stringify(this.intent));
        }
        const response = await this.$base.api.post(
          "/sales/insert_payment",
          {
            sale_id: this.sale.id,
            customer_id: this.sale.customer_id,
            amount,
            payment_type: this.method,
          },
          {
            timeout: 45000,
            headers:
              this.method === "mercadopago"
                ? { "Idempotency-Key": this.intent.key }
                : {},
          },
        );
        if (response.data.pix || response.data.api === "checkout") {
          if (response.data.provider === "mercadopago")
            this.charge = response.data;
          await this.setPix(response.data.pix);
          this.startPolling();
          await this.refreshSale();
        } else {
          this.confirmed = true;
          this.confirmedAmount = amount;
          this.confirmedMethod = this.method;
          await this.refreshSale();
        }
      } catch (error) {
        this.error =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message ||
              "Não foi possível concluir a solicitação. Tente novamente para recuperar a mesma cobrança.";
      } finally {
        this.busy = false;
      }
    },
    startPolling() {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.refreshSale(), 3500);
    },
    async refreshSale() {
      if (this.pollInFlight || this.disposed) return;
      this.pollInFlight = true;
      try {
        const updated = (await this.$base.api.get(`/sales/${this.sale.id}`))
          .data.returnObj;
        this.$emit("updated-sale", updated);
        if (!this.charge && updated.mp_charge_id)
          await this.readCharge(updated.mp_charge_id);
        const providerId =
          this.charge?.payment_id ||
          this.charge?.pix?.paymentId ||
          this.pix?.paymentId;
        const externalId = this.charge ? `mp:${providerId}` : providerId;
        const receipt =
          providerId &&
          updated.payments?.find(
            (payment) => payment.external_id === externalId,
          );
        if (receipt) {
          this.confirmed = true;
          this.confirmedAmount = Number(receipt.amount);
          this.confirmedMethod = receipt.payment_type;
          this.clearIntent();
          clearInterval(this.pollTimer);
        } else if (this.charge) await this.readCharge(this.charge.id);
      } catch {
        /* Uma falha transitória não transforma um Pix pendente em pagamento confirmado. */
      } finally {
        this.pollInFlight = false;
      }
    },
    async verify() {
      if (this.refreshing) return;
      this.refreshing = true;
      this.error = "";
      try {
        if (this.charge)
          await this.$base.api.post(
            `/payments/mercadopago/charges/${this.charge.id}/reconcile`,
            {},
            { timeout: 45000 },
          );
        await this.refreshSale();
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível consultar o pagamento. Tente novamente.";
      } finally {
        this.refreshing = false;
      }
    },
    async cancelPix() {
      if (this.busy || this.refreshing) return;
      this.busy = true;
      this.error = "";
      try {
        await this.$base.api.post(
          "/sales/cancel_pix",
          { sale_id: this.sale.id },
          { timeout: 45000 },
        );
        await this.refreshSale();
        if (!this.confirmed) {
          this.terminal = "Esta cobrança Pix foi cancelada.";
          this.clearIntent();
          clearInterval(this.pollTimer);
        }
      } catch (error) {
        this.error =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message ||
              "Não foi possível cancelar o Pix. Confira o pagamento antes de tentar novamente.";
      } finally {
        this.busy = false;
      }
    },
    async copyPix() {
      try {
        await navigator.clipboard.writeText(this.pix.payload);
        this.copied = true;
      } catch {
        this.error = "Selecione e copie o código no campo Pix copia e cola.";
      }
    },
  },
};
</script>

<style scoped>
.cancel-pix {
  display: block;
  margin: 18px auto 0;
  padding: 6px;
  color: #a16d62;
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
.amount-field input,
.pix-code input,
select {
  max-width: none;
}
.muted {
  font-size: 13px;
  color: #7a8974;
}
.sandbox-note {
  font-size: 10px;
  color: #8e7739;
  background: #fffae8;
  border: 1px solid #f0e3b5;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 20px;
}
.balance,
.checkout-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  color: #819076;
  font-size: 12px;
}
.balance strong,
.checkout-total strong {
  color: #243e2b;
  font-size: 25px;
  font-weight: 700;
}
.field-label {
  display: block;
  margin: 22px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #465e3d;
}
select,
.amount-field input {
  width: 100%;
  border: 1px solid #dfe6da;
  background: white;
  border-radius: 9px;
  padding: 12px;
  font-size: 14px;
  color: #34502b;
}
.amount-field {
  position: relative;
}
.amount-field > span {
  position: absolute;
  top: 13px;
  left: 13px;
  color: #9aa58d;
  font-size: 14px;
}
.amount-field input {
  padding-left: 43px;
}
.amount-help {
  font-size: 10px;
  color: #9ba58d;
  line-height: 1.6;
  margin-top: 8px;
}
.pay-primary,
.pay-secondary {
  border-radius: 9px;
  padding: 11px 18px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.pay-primary {
  background: #497c39;
  border: 1px solid #497c39;
  color: #fff;
}
.pay-secondary {
  background: #fff;
  border: 1px solid #dfe6d9;
  color: #6e7e60;
}
button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.payment-error {
  margin-top: 18px;
  padding: 12px;
  background: #fff0f1;
  border-radius: 9px;
  color: #a34047;
  font-size: 12px;
  line-height: 1.6;
}
.setup-note {
  background: #f4f8ef;
  border: 1px solid #e0ebd5;
  padding: 13px;
  border-radius: 9px;
  color: #748569;
  font-size: 11px;
}
.setup-note a {
  display: block;
  color: #497a36;
  margin-top: 7px;
}
.pix-checkout {
  text-align: center;
}
.pix-qr {
  margin: 6px auto 18px;
  border: 1px solid #e6ebdf;
  padding: 10px;
  border-radius: 12px;
  background: white;
}
.pix-instructions {
  color: #8a977d;
  font-size: 12px;
  line-height: 1.6;
}
.pix-code {
  margin-top: 20px;
  text-align: left;
}
.pix-code label {
  font-size: 10px;
  color: #77876c;
}
.pix-code > div {
  display: flex;
  margin-top: 7px;
  gap: 8px;
}
.pix-code input {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: 1px solid #e0e7da;
  border-radius: 8px;
  padding: 9px;
  color: #8a977c;
  font-size: 11px;
  background: #f8faf5;
}
.pix-code button {
  border: 1px solid #cbdcbe;
  background: #f0f7e9;
  border-radius: 8px;
  padding: 0 13px;
  font-size: 11px;
  color: #60814b;
}
.waiting-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #63844e;
  font-size: 12px;
  margin-top: 24px;
}
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #e0ebd5;
  border-top-color: #6d9455;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
.confirmation-help {
  font-size: 10px;
  color: #a4ad99;
  margin-top: 7px;
}
.payment-link {
  display: inline-block;
  margin-top: 14px;
  font-size: 11px;
  color: #62844d;
}
.qr-loading {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
  color: #819472;
}
.payment-success {
  text-align: center;
  padding: 12px 0 0;
}
.success-icon {
  margin: 0 auto 20px;
  width: 70px;
  height: 70px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 34px;
  background: #eef7e5;
  color: #5e8c43;
  box-shadow: 0 0 0 9px #f8fbf4;
}
.payment-success h3 {
  font-size: 24px;
  font-weight: 700;
  color: #2e4e23;
}
.payment-success > p {
  font-size: 12px;
  color: #8d9b80;
  margin-top: 8px;
}
.payment-success > strong {
  display: block;
  font-size: 34px;
  font-weight: 700;
  color: #35592a;
  margin: 26px 0 5px;
}
.method-label {
  display: block;
  color: #8da07e;
  font-size: 12px;
}
.success-details {
  margin-top: 28px;
  border-top: 1px solid #e8eedf;
  padding-top: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  text-align: left;
  gap: 12px;
  font-size: 11px;
  color: #a0ad91;
}
.success-details b {
  text-align: right;
  color: #647d51;
  font-weight: 500;
}
.terminal-note,
.recovery-note {
  font-size: 12px;
  line-height: 1.6;
  color: #9b7a42;
  padding: 14px;
  background: #fff9ec;
  border-radius: 8px;
  margin-top: 20px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
