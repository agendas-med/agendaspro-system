<template>
    <GoogleLogin v-if="enabled" :callback="handleLoginSuccess">
        <button type="button" class="google-btn">
            <img src="../../assets/img/google-logo.png" alt="" aria-hidden="true">
            {{ text }}
        </button>
    </GoogleLogin>
</template>
<script>
import { GoogleLogin } from 'vue3-google-login';

export default {
    props: ["text"],
    emits: ["response"],
    components: {
        GoogleLogin
    },
    computed: {
        // Sem clientId configurado o plugin nao e registrado: oculta o botao.
        enabled() {
            return !!this.$config.public.googleClientId;
        }
    },
    methods: {
        handleLoginSuccess(response) {
            this.$base.api.post("/users/google-login", { token: response.code }).then((results) => {
                this.$myFunctions.storeLoginResponse(this, results.data);
                this.$emit("response", { msg: "Usuário autenticado com sucesso", type: "success" });

                window.location.href = "/agenda";
            }).catch((error) => {
                this.$emit("response", { msg: this.$myFunctions.errorMessage(error, "Não foi possível entrar com o Google"), type: "error" });
            })
        }
    }
}
</script>
<style scoped>
.google-btn {
    white-space: nowrap;
    font-size: 1rem;
    font-weight: 600;
    background: var(--cinza-claro);
    height: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--cinza-medio);
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-6);
    transition: all 0.4s ease-in-out;

    & img {
        width: 35px;
        height: 35px;
        border-radius: 50%;
    }

    &:hover {
        background: var(--azul-claro);
    }
}
</style>
