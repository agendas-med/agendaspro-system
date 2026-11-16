<template>
  <div class="authentication-page-internal">
    <div class="authentication-header text-left">
      <h1 class="fontsize-xl-bold preto">Cadastre-se</h1>
      <p class="fontsize-md cinza">Cadastre-se no AgendasPro para começar a gerenciar o seu negócio.</p>
    </div>
    <form @submit.prevent="register">
      <div class="grid grid-cols-1 gap-4">
        <div class="form-group">
          <label for="name">Seu nome</label>
          <input type="text" v-model="name" id="name" required autocomplete="name">
        </div>
        <div class="form-group">
          <label for="email">Seu email</label>
          <input type="email" v-model="email" id="email" required placeholder="usuario@dominio.com"
            autocomplete="email" :disabled="invited">
        </div>
        <div class="form-group">
          <label for="password">Sua senha</label>
          <input type="password" v-model="password" id="password" required autocomplete="new-password"
            :minlength="minLength" aria-describedby="password-strength">
          <div id="password-strength" class="password-strength" v-if="password" aria-live="polite">
            <div class="strength-bar" aria-hidden="true">
              <span v-for="n in 4" :key="n" :class="{ filled: n <= strength.score, ['level-' + strength.score]: n <= strength.score }"></span>
            </div>
            <p class="fontsize-sm cinza">
              Força da senha: <strong>{{ strength.label }}</strong>
              <span v-if="!strength.acceptable"> — use no mínimo {{ minLength }} caracteres, misturando letras e números.</span>
            </p>
          </div>
        </div>
        <div class="form-group">
          <label for="repeat-password">Repita a senha</label>
          <input type="password" v-model="repeat_password" id="repeat-password" required autocomplete="new-password">
        </div>
        <div class="terms flex items-start">
          <input type="checkbox" id="accept-terms" v-model="acceptedTerms" required>
          <label for="accept-terms" class="fontsize-sm cinza">
            Li e aceito os
            <a :href="termsUrl" target="_blank" rel="noopener noreferrer" class="underline">Termos de Uso</a>
            e a
            <a :href="privacyUrl" target="_blank" rel="noopener noreferrer" class="underline">Política de Privacidade</a>.
          </label>
        </div>
        <span class="mt-3">Já tem conta? <NuxtLink to="/entrar" class="underline">Entrar</NuxtLink></span>
      </div>
      <UtilsLoadingResponse :msg="response" :type="responseType" :loading="loading"
        @eraseError="$myFunctions.resetResponse($.proxy)" />
      <button type="submit" class="btn btn-primary" :disabled="loading || !acceptedTerms">Registrar</button>
    </form>
    <div class="or-separator">
      <span class="fontsize-sm preto">ou</span>
    </div>
    <GoogleAuth text="Registrar com o Google" @response="handleGoogleResponse($event)"></GoogleAuth>
  </div>
</template>

<script>
import { passwordStrength, MIN_PASSWORD_LENGTH } from '../utils/password.js';

export default {
  data() {
    return {
      name: "",
      email: "",
      token: null,
      password: "",
      repeat_password: "",
      acceptedTerms: false,
      response: "",
      responseType: "",
      loading: false
    }
  },
  computed: {
    minLength() {
      return MIN_PASSWORD_LENGTH;
    },
    strength() {
      return passwordStrength(this.password);
    },
    invited() {
      return !!(this.token && this.email);
    },
    siteBase() {
      return String(this.$config.public.siteUrl || "").replace(/\/+$/, "");
    },
    termsUrl() {
      return this.siteBase + "/termos";
    },
    privacyUrl() {
      return this.siteBase + "/privacidade";
    }
  },
  methods: {
    handleGoogleResponse: function (response) {
      this.$myFunctions.setResponse(this, response.msg, response.type);
    },
    setTemporaryEmail: function (email) {
      sessionStorage.setItem("temporary_email", email);
    },
    register: async function () {
      const data = {
        name: this.name,
        email: this.email,
        password: this.password
      }

      if (!this.acceptedTerms) {
        this.$myFunctions.setResponse(this, "É preciso aceitar os Termos de Uso e a Política de Privacidade.", "error");
        return;
      }

      if (!this.strength.acceptable) {
        this.$myFunctions.setResponse(this, "Senha fraca: use no mínimo " + this.minLength + " caracteres, misturando letras e números.", "error");
        return;
      }

      if (this.password != this.repeat_password) {
        this.$myFunctions.setResponse(this, "As senhas não coincidem", "error");
        return;
      }

      this.$myFunctions.resetResponse(this);
      this.loading = true;

      try {
        const response = await this.$base.api.post("/users/register", data);

        // Convite: entra na empresa ANTES de sair da página (antes o redirect cortava a chamada).
        if (this.token) {
          await this.$myFunctions.enterCompanyWithToken(this, this.token, data.email);
        }

        this.$myFunctions.setResponse(this, response.data.message || "Cadastro realizado com sucesso", "success");
        const registered = response.data.returnObj && response.data.returnObj.email;
        if (registered) this.setTemporaryEmail(registered);

        setTimeout(() => { this.$myFunctions.logoutUser(); }, 1500);
      } catch (error) {
        this.$myFunctions.setResponse(this, this.$myFunctions.errorMessage(error, "Ocorreu um erro ao registrar"), "error");
      } finally {
        this.loading = false;
      }
    }
  },
  mounted: function () {
    let url = new URLSearchParams(window.location.search);

    this.token = url.get("token");
    this.email = url.get("email") || "";
  }
}
</script>

<script setup>
definePageMeta({ layout: 'login', access: 'public', title: 'Criar conta' })
</script>

<style scoped>
.terms {
  gap: var(--space-3);
}

.terms input[type="checkbox"] {
  flex-shrink: 0;
  margin-top: 2px;
}

.password-strength {
  margin-top: var(--space-2);
}

.strength-bar {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.strength-bar span {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-xs);
  background: var(--cinza-medio);
}

.strength-bar span.level-1 {
  background: #ef4444;
}

.strength-bar span.level-2 {
  background: #eab308;
}

.strength-bar span.level-3 {
  background: #84cc16;
}

.strength-bar span.level-4 {
  background: #22c55e;
}
</style>
