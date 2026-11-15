<template>
    <div class="authentication-page-internal">
      <div class="authentication-header text-left">
        <h1 class="fontsize-xl-bold preto">Redefinir senha</h1>
        <p class="fontsize-md cinza">Utilize uma senha forte e anote ela.</p>
      </div>
      <form @submit.prevent="reserPassword" id="login-form" v-if="!loading && validToken">
        <div class="grid grid-cols-1 gap-4">
          <div class="form-group">
            <label for="password">Nova senha</label>
            <input type="password" v-model="password" id="password" required autocomplete="new-password" :minlength="minLength">
          </div>
          <div class="form-group">
            <label for="repeat-password">Repita a senha</label>
            <input type="password" v-model="repeatPassword" id="repeat-password" required autocomplete="new-password">
          </div>
        </div>
        <UtilsLoadingResponse :msg="response" :type="responseType" :loading="loading" @eraseError="$myFunctions.resetResponse($.proxy)" />
        <button type="submit" class="btn btn-primary">Redefinir senha</button>
      </form>
      <div class="invalid-token" v-if="!loading && !validToken">
        <p class="fontsize-md vermelho">Token inválido ou expirado</p>
      </div>
    </div>
  </template>
  <script>
  import { passwordStrength, MIN_PASSWORD_LENGTH } from '../utils/password.js';

  export default {
    computed: {
      minLength() {
        return MIN_PASSWORD_LENGTH;
      }
    },
    data() {
      return {
        password: "",
        repeatPassword: "",
        response: "",
        responseType: "",
        loading: true,
        validToken: false
      }
    },
    mounted: function () {
      this.checkTokenValidity();
    },
    methods: {
      getParams: function () {
        let url = new URLSearchParams(window.location.search);
        let token = url.get("token");

        return {
          token: token
        }
      },
      checkTokenValidity: function () {
        let self = this;

        self.$base.api.post("/users/check-token-validity", { token: self.getParams().token })
        .then((response) => {            
          self.validToken = true;
        }).catch((error) => {
          self.validToken = false;
        }).then(() => {
          self.loading = false;
        })
      },
      reserPassword: function () {
        let self = this;

        if (self.password != self.repeatPassword) {
          self.$myFunctions.setResponse(self, "Senhas não coincidem", "error");
          return;
        }

        if (!passwordStrength(self.password).acceptable) {
          self.$myFunctions.setResponse(self, "Senha fraca: use no mínimo " + MIN_PASSWORD_LENGTH + " caracteres, misturando letras e números.", "error");
          return;
        }

        self.$base.api.post("/users/reset-password", { token: self.getParams().token, password: self.password })
        .then((response) => {
          self.$myFunctions.setResponse(self, "Senha alterada com sucesso", "success");

          setTimeout(() => {
            window.location.href = "/entrar";
          }, 2000)
        }).catch((error) => {
          self.$myFunctions.setResponse(self, self.$myFunctions.errorMessage(error, "Ocorreu um erro ao alterar a senha"), "error");
        })
      }
    }
  }
  </script>

<script setup>
definePageMeta({ layout: 'login', access: 'public', title: 'Redefinir senha' })
</script>
