<template>
  <div class="connection-card">
    <div class="connection-top">
      <span class="mp-icon" aria-hidden="true">↔</span>
      <span
        class="connection-status"
        :class="{ connected: settings?.connection }"
        >{{
          settings?.connection ? "Conta conectada" : "Conecte para receber"
        }}</span
      >
    </div>
    <p class="eyebrow">MERCADO PAGO</p>
    <h3>
      {{
        settings?.connection
          ? "Seu dinheiro, na sua conta."
          : "Receba pelos seus agendamentos."
      }}
    </h3>
    <p class="description">
      {{
        settings?.connection
          ? "Os pagamentos vão para sua conta Mercado Pago, com a comissão do AgendasPro separada automaticamente."
          : "Conecte sua conta Mercado Pago e ofereça Pix e cartão aos seus clientes."
      }}
    </p>
    <div v-if="settings?.connection" class="account-identity">
      <span class="avatar">{{
        (settings.connection.nickname || "MP").slice(0, 2).toUpperCase()
      }}</span>
      <div>
        <strong>{{
          settings.connection.nickname || "Conta Mercado Pago"
        }}</strong
        ><span>ID {{ settings.connection.collector_id }}</span>
      </div>
    </div>
    <div class="connection-bottom">
      <p>
        O acesso é autorizado no Mercado Pago.<br />Você não compartilha sua
        senha com o AgendasPro.
      </p>
      <button
        v-if="isAdmin"
        type="button"
        :disabled="busy || !settings?.configured"
        :class="settings?.connection ? 'secondary' : 'primary'"
        @click="settings?.connection ? (disconnecting = true) : connect()"
      >
        {{
          busy
            ? "Aguarde…"
            : settings?.connection
              ? "Desconectar conta"
              : "Conectar Mercado Pago →"
        }}
      </button>
      <span v-else class="admin-note"
        >Um administrador pode conectar a conta.</span
      >
    </div>
    <p v-if="settings && !settings.configured" class="setup-message">
      A conexão está sendo preparada pela equipe do AgendasPro. Você pode
      continuar usando a agenda e os recebimentos manuais.
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <PaymentsDialog
      v-if="disconnecting"
      title="Desconectar Mercado Pago?"
      eyebrow="RECEBIMENTOS"
      :busy="busy"
      @close="disconnecting = false"
    >
      <p>
        Novas cobranças online ficarão indisponíveis até você conectar uma conta
        novamente. O histórico dos seus pagamentos será preservado.
      </p>
      <template #footer
        ><button
          class="secondary"
          :disabled="busy"
          @click="disconnecting = false"
        >
          Manter conexão</button
        ><button class="primary" :disabled="busy" @click="disconnect">
          Desconectar
        </button></template
      >
    </PaymentsDialog>
  </div>
</template>
<script>
export default {
  props: { settings: Object },
  emits: ["changed"],
  data: () => ({ busy: false, error: "", disconnecting: false }),
  computed: {
    isAdmin() {
      return this.$global.user?.permission == 1;
    },
  },
  methods: {
    async connect() {
      this.busy = true;
      this.error = "";
      try {
        const { data } = await this.$base.api.post(
          "/payments/mercadopago/connect",
        );
        const url = new URL(data.url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "auth.mercadopago.com.br"
        )
          throw new Error();
        window.location.assign(url.href);
      } catch (error) {
        this.error =
          error.response?.data?.message ||
          "Não foi possível iniciar a conexão. Tente novamente.";
        this.busy = false;
      }
    },
    async disconnect() {
      this.busy = true;
      this.error = "";
      try {
        await this.$base.api.post("/payments/mercadopago/disconnect");
        this.disconnecting = false;
        this.$emit("changed");
      } catch {
        this.error = "Não foi possível desconectar. Tente novamente.";
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>
<style scoped>
.connection-card {
  padding: 30px;
  border-radius: 22px;
  background: linear-gradient(125deg, #effbf5, #f8fffc);
  border: 1px solid #cce8dc;
  color: #143e32;
}
.connection-top,
.connection-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
}
.mp-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: white;
  font-size: 30px;
  color: #068963;
  box-shadow: 0 3px 14px #154d3210;
}
.connection-status {
  font-size: 12px;
  border: 1px solid #cfdfd7;
  border-radius: 24px;
  padding: 7px 12px;
  background: #ffffffa6;
  color: #64786d;
}
.connection-status.connected {
  color: #067650;
  border-color: #addcc9;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  margin: 25px 0 8px;
  color: #43816a;
  font-weight: 700;
}
h3 {
  font-size: 25px;
  line-height: 1.3;
  font-weight: 700;
  margin: 0 0 12px;
}
.description {
  max-width: 600px;
  font-size: 14px;
  line-height: 1.7;
  color: #4a6a5b;
  margin: 0 0 24px;
}
.account-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}
.avatar {
  background: #d8efe3;
  border-radius: 50%;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  font-weight: 700;
}
.account-identity strong,
.account-identity div span {
  display: block;
}
.account-identity div span {
  font-size: 12px;
  color: #6f8277;
  margin-top: 3px;
}
.connection-bottom {
  border-top: 1px solid #d6e9df;
  padding-top: 22px;
}
.connection-bottom p,
.admin-note {
  font-size: 12px;
  line-height: 1.65;
  color: #667d70;
  margin: 0;
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
.secondary {
  background: white;
  border: 1px solid #cbded3;
  color: #315b47;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button:focus-visible {
  outline: 3px solid #78bda4;
  outline-offset: 3px;
}
.setup-message {
  font-size: 12px;
  line-height: 1.6;
  margin-top: 15px;
  color: #5d7266;
}
.error {
  font-size: 13px;
  color: #b53333;
  margin-top: 14px;
}
@media (max-width: 650px) {
  .connection-card {
    padding: 22px;
  }
  .connection-bottom {
    align-items: stretch;
    flex-direction: column;
  }
  h3 {
    font-size: 22px;
  }
  .connection-bottom button {
    width: 100%;
  }
}
</style>
