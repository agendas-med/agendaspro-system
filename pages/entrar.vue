<template>
    <div class="authentication-page-internal">
      <div class="authentication-header text-left">
        <h1 class="fontsize-xl-bold preto">Entrar</h1>
        <p class="fontsize-md cinza">Faça login na sua conta do AgendasPro para acompanhar seus agendamentos.</p>
      </div>
      <form @submit.prevent="login" id="login-form">
        <div class="grid grid-cols-1 gap-4">
          <div class="form-group">
            <label for="email">Seu email</label>
            <input type="email" v-model="email" id="email" required placeholder="usuario@dominio.com">
          </div>
          <div class="form-group">
            <label for="password">Sua senha</label>
            <input type="password" v-model="password" id="password" required>
            <div class="login-utils mt-3">
              <span>Ainda não tem uma conta? <a class="cursor-pointer underline" v-on:click="$router.push('/registro')">Registre-se</a></span>
              <router-link to="/recuperar-senha">Esqueci minha senha</router-link>
            </div>
            <UtilsSwitch v-if="showLembrar" label="Lembrar-me" @changedState="lembrar = $event" style="margin-top: var(--space-3);" />
          </div>
        </div>
        <UtilsLoadingResponse :msg="response" :type="responseType" :loading="loading" @eraseError="$myFunctions.resetResponse($.proxy)" />
        <button type="submit" class="btn btn-primary" :disabled="loading">Entrar</button>
      </form>
      <div class="or-separator">
        <span class="fontsize-sm preto">ou</span>
      </div>
      <GoogleAuth text="Entrar com o Google" @response="handleGoogleResponse($event)"></GoogleAuth>
    </div>
  </template>
  
  <script>

  export default {
    data() {
      return {
        email: "",
        password: "",
        response: "",
        responseType: "",
        loading: false,
        lembrar: false,
        showLembrar: true
      }
    },
    watch: {
      email: function () {
        if (this.email == localStorage.getItem("email")) {
          this.showLembrar = false;
        } else {
          this.showLembrar = true;
        }
      }
    },
    mounted: function () {
      let localStorageEmail = localStorage.getItem("email");

      if (localStorageEmail) this.email = localStorageEmail;
      // O redirecionamento de quem já está logado é feito pelo middleware (access: 'guest').
    },
    methods: {
      handleGoogleResponse: function (response) {
        this.$myFunctions.setResponse(this, response.msg, response.type);
      },
      login: function () {
        let self = this;
        let data = {
          email: this.email,
          password: this.password
        }

        this.loading = true;

        this.$base.api.post("/users/login", data)
        .then(function(response2){            
          self.$myFunctions.storeLoginResponse(self, response2.data);
          self.$myFunctions.setResponse(self, response2.data.message || "Login realizado com sucesso", "success");

          if (self.lembrar) {
            localStorage.setItem("email", self.email);
          }

          window.location.href = "/agenda";
        }).catch((error) => {
          const status = error && error.response && error.response.status;
          const fallback = "Falha na autenticação";
          // 401/400 = credenciais; demais casos (rede, 5xx, 429) ganham mensagem própria.
          const msg = (status === 401 || status === 400 || status === 403)
            ? fallback
            : self.$myFunctions.errorMessage(error, fallback);
          self.$myFunctions.setResponse(self, msg, "error");
        }).then(() => {
          self.loading = false;
        })
      }
    }
  }
  </script>
  <style scoped>
  .login-utils {
    display: flex;
    justify-content: space-between;
    align-items: center;

    & a {
      text-decoration: underline;
    }
  }
</style>

<script setup>
definePageMeta({ layout: 'login', access: 'guest', title: 'Entrar' })
</script>
