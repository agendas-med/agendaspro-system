<template>
  <div class="receiving-account">
    <p v-if="loading" class="muted" role="status">
      Carregando conta de recebimento…
    </p>
    <div v-else-if="loadError" class="account-error" role="alert">
      {{ loadError }}
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <article
      v-else
      class="account-card"
      :class="{ configured: settings.destination }"
    >
      <div class="bank-illustration" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
          <path
            d="M6 19 24 8l18 11H6ZM10 39h28M8 43h32M14 24v10m10-10v10m10-10v10"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>RECEBIMENTOS</span>
      </div>
      <div class="account-content">
        <div class="account-heading">
          <p class="eyebrow">CONTA BANCÁRIA</p>
          <span
            class="account-badge"
            :class="{ pending: !settings.destination }"
            >{{
              settings.destination ? "● Cadastrada" : "Cadastro pendente"
            }}</span
          >
        </div>
        <h3>
          {{
            settings.destination?.bank_name ||
            (settings.destination
              ? "Sua conta de recebimento"
              : "Seu dinheiro, na conta certa.")
          }}
        </h3>
        <template v-if="settings.destination">
          <p class="holder">{{ settings.destination.holder_name }}</p>
          <p class="key-line">
            <span>Pix · {{ keyLabel(settings.destination.pix_key_type) }}</span
            ><strong>{{ settings.destination.pix_key_masked }}</strong>
          </p>
        </template>
        <p v-else class="description">
          Cadastre a conta em que sua empresa recebe. Os repasses via Pix usam a
          chave vinculada ao seu banco.
        </p>
        <div class="account-actions">
          <span class="muted small">{{
            settings.destination
              ? "Dados protegidos · chave exibida parcialmente"
              : "Banco, titular e chave Pix. Tudo em um só lugar."
          }}</span>
          <button
            v-if="isAdmin"
            type="button"
            class="account-button"
            @click="open"
          >
            {{
              settings.destination ? "Editar conta" : "Cadastrar conta bancária"
            }}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3 13 13 3M3 3h10v10"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <span v-else class="muted small"
            >Um administrador pode cadastrar ou alterar a conta.</span
          >
        </div>
      </div>
    </article>
    <p v-if="success" class="account-success" role="status">
      ✓ Conta de recebimento salva com sucesso.
    </p>

    <PaymentsDialog
      v-if="editing"
      title="Conta de recebimento"
      eyebrow="SEUS DADOS BANCÁRIOS"
      :busy="saving"
      @close="editing = false"
    >
      <p class="modal-intro">
        Informe a conta que vai receber os repasses da sua empresa. A
        transferência usa sua chave Pix.
      </p>
      <form id="receiving-account-form" @submit.prevent="save">
        <div class="account-form-grid">
          <div class="wide field">
            <label for="receiving-bank">Banco <span>(opcional)</span></label
            ><input
              id="receiving-bank"
              v-model="form.bank_name"
              maxlength="100"
              placeholder="Ex.: Banco Inter, Nubank, Itaú"
              autocomplete="organization"
            />
          </div>
          <div class="wide field">
            <label for="receiving-holder">Nome do titular</label
            ><input
              id="receiving-holder"
              v-model="form.holder_name"
              required
              minlength="3"
              maxlength="150"
              placeholder="Nome completo ou razão social"
              autocomplete="name"
            />
          </div>
          <div class="wide field">
            <label for="receiving-document">CPF ou CNPJ do titular</label
            ><input
              id="receiving-document"
              v-model="form.holder_document"
              required
              inputmode="numeric"
              readonly
              aria-describedby="document-help"
            /><small id="document-help"
              >O titular deve ser o mesmo CPF/CNPJ cadastrado na empresa.</small
            >
          </div>
          <div class="field">
            <label for="receiving-key-type">Tipo de chave Pix</label
            ><select id="receiving-key-type" v-model="form.pix_key_type">
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Celular</option>
              <option value="PIX_CODE">Chave aleatória</option>
            </select>
          </div>
          <div class="field">
            <label for="receiving-key">Chave Pix</label
            ><input
              id="receiving-key"
              v-model="form.pix_key"
              :required="requiresKey"
              :placeholder="keyPlaceholder"
              maxlength="255"
              :inputmode="
                ['CPF', 'CNPJ', 'PHONE'].includes(form.pix_key_type)
                  ? 'tel'
                  : 'text'
              "
              :type="form.pix_key_type === 'EMAIL' ? 'email' : 'text'"
              autocomplete="off"
            /><small v-if="!requiresKey"
              >Em branco, mantém a chave
              {{ settings.destination.pix_key_masked }}.</small
            >
          </div>
        </div>
        <p class="privacy-note">
          <span aria-hidden="true">⌁</span> Confira se a chave pertence à conta
          e ao titular informados.
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
      <template #footer
        ><button
          class="secondary-button"
          type="button"
          :disabled="saving"
          @click="editing = false"
        >
          Cancelar</button
        ><button
          class="account-button"
          type="submit"
          form="receiving-account-form"
          :disabled="saving"
        >
          {{ saving ? "Salvando…" : "Salvar conta" }}
        </button></template
      >
    </PaymentsDialog>
  </div>
</template>

<script>
export default {
  emits: ["loaded", "saved"],
  data: () => ({
    loading: true,
    loadError: "",
    settings: {},
    editing: false,
    saving: false,
    error: "",
    success: false,
    form: {},
  }),
  computed: {
    isAdmin() {
      return this.$global.user?.permission == 1;
    },
    requiresKey() {
      return (
        !this.settings.destination ||
        this.settings.destination.pix_key_type !== this.form.pix_key_type
      );
    },
    keyPlaceholder() {
      return {
        CPF: "Somente números",
        CNPJ: "Somente números",
        EMAIL: "titular@exemplo.com",
        PHONE: "+5511999999999",
        PIX_CODE: "Cole sua chave aleatória",
      }[this.form.pix_key_type];
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    keyLabel(type) {
      return (
        {
          CPF: "CPF",
          CNPJ: "CNPJ",
          EMAIL: "E-mail",
          PHONE: "Celular",
          PIX_CODE: "Chave aleatória",
        }[type] || type
      );
    },
    async load() {
      this.loading = true;
      this.loadError = "";
      try {
        this.settings = (
          await this.$base.api.get("/payments/mercadopago/status")
        ).data;
        Object.assign(this.$global.paymentStatus, this.settings);
        this.$emit("loaded", this.settings);
      } catch {
        this.loadError = "Não foi possível carregar a conta de recebimento.";
      } finally {
        this.loading = false;
      }
    },
    open() {
      const destination = this.settings.destination;
      const document = (this.settings.company?.document || "").replace(
        /\D/g,
        "",
      );
      this.form = {
        bank_name: destination?.bank_name || "",
        holder_name:
          destination?.holder_name || this.settings.company?.name || "",
        holder_document: document,
        pix_key_type:
          destination?.pix_key_type ||
          (document.length === 14 ? "CNPJ" : "CPF"),
        pix_key: "",
      };
      this.error = "";
      this.success = false;
      this.editing = true;
    },
    async save() {
      if (this.saving) return;
      this.saving = true;
      this.error = "";
      try {
        const payload = { ...this.form };
        if (!payload.pix_key.trim()) delete payload.pix_key;
        if (payload.pix_key_type === "PHONE" && payload.pix_key)
          payload.pix_key = "+" + payload.pix_key.replace(/\D/g, "");
        await this.$base.api.put("/payments/mercadopago/destination", payload);
        this.editing = false;
        this.success = true;
        await this.load();
        this.$emit("saved");
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível salvar a conta. Confira os dados e tente novamente.";
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.account-card {
  display: flex;
  gap: 28px;
  padding: 28px;
  border: 1px solid #dfe8de;
  border-radius: 20px;
  background: linear-gradient(120deg, #f7fbf5, #fff 70%);
  box-shadow: 0 4px 20px #15362305;
}
.bank-illustration {
  flex: 0 0 140px;
  min-height: 154px;
  border-radius: 15px;
  color: #dcf5cb;
  background: radial-gradient(at 100% 0, #608e4c, #243f30 75%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.bank-illustration span {
  font-size: 9px;
  letter-spacing: 0.16em;
  font-weight: 700;
}
.account-content {
  flex: 1;
  min-width: 0;
}
.account-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.14em;
  font-weight: 700;
  color: #74806f;
}
.account-badge {
  padding: 4px 9px;
  background: #e8f4e2;
  border-radius: 20px;
  color: #437435;
  font-size: 11px;
  font-weight: 600;
}
.account-badge.pending {
  color: #8a6b27;
  background: #fff4d9;
}
h3 {
  color: #1c3528;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.4px;
  margin-bottom: 7px;
}
.holder,
.description {
  color: #657064;
  font-size: 14px;
  line-height: 1.65;
  max-width: 510px;
}
.key-line {
  margin-top: 8px;
  font-size: 12px;
  display: flex;
  gap: 14px;
  color: #627160;
}
.key-line strong {
  font-family: monospace;
  color: #263e2d;
}
.account-actions {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
}
.small {
  font-size: 11px;
  line-height: 1.5;
}
.muted {
  color: #849080;
}
.account-button,
.secondary-button {
  border-radius: 9px;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.account-button {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  background: #497c39;
  color: #fff;
  border: 1px solid #497c39;
  white-space: nowrap;
}
.account-button:hover {
  background: #375e2c;
}
.account-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.secondary-button {
  color: #657060;
  background: #fff;
  border: 1px solid #dfe5dc;
}
.modal-intro {
  color: #71806f;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 22px;
}
.account-form-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 17px;
}
.wide {
  grid-column: 1/-1;
}
.field label {
  display: block;
  margin-bottom: 7px;
  color: #354c3c;
  font-size: 12px;
  font-weight: 600;
}
.field label span {
  font-weight: 400;
  color: #95a08f;
}
.field input,
.field select {
  width: 100%;
  max-width: none;
  min-height: 45px;
  padding: 10px 12px;
  border: 1px solid #dfe5db;
  border-radius: 9px;
  font-size: 13px;
  color: #263c2e;
  background: #fff;
}
.field input:read-only {
  background: #f6f8f4;
  color: #75816e;
}
.field small {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #8b9585;
  line-height: 1.5;
}
.privacy-note {
  margin-top: 22px;
  padding: 12px;
  border-radius: 9px;
  background: #f4f8f1;
  font-size: 11px;
  line-height: 1.6;
  color: #66805a;
}
.form-error,
.account-error {
  color: #ad3643;
  background: #fff1f2;
  padding: 12px;
  margin-top: 14px;
  font-size: 12px;
  border-radius: 9px;
}
.account-error button {
  text-decoration: underline;
}
.account-success {
  margin-top: 12px;
  color: #437435;
  font-size: 12px;
}
@media (max-width: 780px) {
  .account-card {
    padding: 20px;
    gap: 18px;
  }
  .bank-illustration {
    flex-basis: 86px;
    min-height: 120px;
  }
  .bank-illustration span {
    display: none;
  }
  .account-actions {
    flex-direction: column;
    align-items: flex-start;
  }
  h3 {
    font-size: 19px;
  }
}
@media (max-width: 480px) {
  .account-card {
    flex-direction: column;
  }
  .bank-illustration {
    flex-basis: auto;
    min-height: 75px;
    align-items: flex-start;
    padding: 18px;
  }
  .bank-illustration svg {
    width: 32px;
    height: 32px;
  }
  .account-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
