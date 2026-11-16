<template>
    <div class="w-full h-full flex items-center justify-center absolute" v-if="systemLoading">
        <div v-if="initializationError" class="text-center p-6">
            <p>{{ initializationError }}</p>
            <button type="button" class="btn btn-primary mt-4" @click="reloadSystem">Tentar novamente</button>
        </div>
        <UtilsLoading v-else :loading="true" />
    </div>
    <div v-else>
        <SidebarMenu class="sidebar" ref="sidebar"
            :class="isResponsive ? sidebarOpen ? 'sidebar-opened' : 'sidebar-closed' : ''"
            @closeSidebar="sidebarOpen = false" />
        <div class="sidebar-menu-wrapper" v-show="isResponsive && sidebarOpen" v-on:click="toggleSidebar()"></div>
        <Header class="header" @toggleMenu="toggleSidebar()" />
        <div class="slot">
            <div v-if="$global.company && $global.company.asaas_status !== 'APPROVED'"
                class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 shadow-sm">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <font-awesome icon="triangle-exclamation" class="text-yellow-400 text-xl" />
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-yellow-700 font-bold">
                            Recebimentos online indisponíveis
                        </p>
                        <p class="text-sm text-yellow-600 mt-1">
                            Você pode gerenciar a agenda e registrar pagamentos manuais.
                            Para receber Pix automaticamente, configure e aprove sua conta Asaas.
                        </p>
                        <a v-if="onboardingUrl" :href="onboardingUrl" target="_blank"
                            class="mt-3 inline-block bg-yellow-400 text-yellow-900 px-4 py-2 rounded font-bold text-xs hover:bg-yellow-500 transition">
                            Enviar Documentos Agora
                        </a>
                    </div>
                </div>
            </div>
            <slot></slot>
        </div>
    </div>
</template>
<script>
export default {
    data() {
        return {
            sidebarOpen: false,
            isResponsive: window.innerWidth <= 1029,
            systemLoading: true,
            initializationError: '',
            onboardingUrl: "" // Variável adicionada
        }
    },
    methods: {
        reloadSystem() { window.location.reload(); },
        toggleSidebar: function () {
            this.sidebarOpen = !this.sidebarOpen;
        },
        // Nova função para consultar o status na API
        fetchAsaasStatus: function () {
            if (this.$global.company && this.$global.company.id) {
                this.$base.api.get("/companies/asaas_status")
                    .then((response) => {
                        const asaasData = response.data.returnObj;
                        if (asaasData) {
                            // Atualiza o cache global para remover o banner caso tenha sido aprovado
                            this.$global.company.asaas_status = asaasData.status;
                            this.onboardingUrl = asaasData.onboardingUrl;
                        }
                    }).catch(() => { /* banner informativo: falha silenciosa, não bloqueia o uso */ });
            }
        }
    },
    mounted: function () {
        this.onResize = () => {
            this.isResponsive = window.innerWidth <= 1029;
        };
        window.addEventListener('resize', this.onResize);
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.onResize);
    },
    async created() {
        // A sessão já foi validada pelo middleware (auth.global); aqui só reaproveitamos a mesma promessa.
        this.$myFunctions.ensureSession(this).then((session) => {
            if (session.status === 'error') {
                this.initializationError = 'Não foi possível carregar o sistema. Verifique a conexão com a API e tente novamente.';
                return;
            }
            if (session.status !== 'ok') {
                // Sessão inválida ou sem empresa: o middleware decide o destino na próxima navegação.
                navigateTo(session.status === 'no-company' ? '/criar-empresa' : '/entrar', { replace: true });
                return;
            }
            this.fetchAsaasStatus();

            setTimeout(() => {
                this.systemLoading = false;
            }, 500)
        }).catch(() => { this.initializationError = 'Não foi possível carregar o sistema. Verifique a conexão com a API e tente novamente.'; });
    }
}
</script>

<style>
.sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 300px;
    border-right: 1px solid var(--cinza-medio);
    transition: transform 0.4s, visibility 0s;
    z-index: 2;
    /* Menu mais alto que a tela (telas baixas, celular): rola dentro do menu em vez de vazar por cima da página. */
    overflow-y: auto;
    overscroll-behavior: contain;
}

.sidebar-menu-wrapper {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1;
}

.header {
    height: 60px;
    width: calc(100vw - 300px);
    position: fixed;
    top: 0;
    right: 0;
    z-index: 3;
    background: white;
    border-bottom: 1px solid var(--cinza-medio);
}

.slot {
    width: calc(100vw - 300px);
    height: calc(100vh - 60px);
    position: fixed;
    top: 60px;
    left: 300px;
    transition: transform 0.4s;
    padding: var(--space-6);
    overflow-y: auto;
}

@media (max-width: 1029px) {
    .sidebar:not(.sidebar-opened) {
        transform: translateX(-300px);
        /* Fechado = fora do foco do teclado e dos leitores de tela (some depois da animação). */
        visibility: hidden;
        transition: transform 0.4s, visibility 0s 0.4s;
    }

    .sidebar {
        height: calc(100vh - 60px);
        top: 60px;
    }

    /* Sem transform: um ancestral transformado prende os modais (position: fixed) à área rolável da página. */
    .slot {
        left: 0;
    }

    .header,
    .slot {
        width: 100vw;
    }
}

@media (max-width: 480px) {
    .sidebar {
        width: 100vw;
    }

    .sidebar:not(.sidebar-opened) {
        transform: translateY(-100vh);
    }
}

.sidebar-icons {
    width: 26.4px;
    height: 26.4px;
    color: var(--cinza);
    margin-right: var(--space-6);
    transition: color 0.4s;
}

.sidebar-text {
    color: var(--cinza);
}
</style>
