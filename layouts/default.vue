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
            <div v-if="paymentStatus?.provider === 'asaas' && $global.company && $global.company.asaas_status !== 'APPROVED'"
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
            <div v-if="paymentStatus?.provider === 'mercadopago' && !paymentStatus.destination && $route.path !== '/configuracoes/recebimentos'" class="receiving-reminder">
                <span><strong>Prepare seus recebimentos.</strong> Cadastre a conta bancária da empresa para cobrar com Pix.</span>
                <NuxtLink to="/configuracoes/recebimentos">Cadastrar conta →</NuxtLink>
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
            paymentStatus: this.$global.paymentStatus,
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
                    }).catch(err => console.error("Erro ao validar conta Asaas."));
            }
        }
    },
    mounted: function () {
        window.onresize = () => {
            this.isResponsive = window.innerWidth <= 1029;
        }
    },
    async created() {
        this.$myFunctions.initSystem(this).then((initialized) => {
            if (!initialized) return;
            this.$base.api.get('/payments/mercadopago/status').then(response => {
                Object.assign(this.paymentStatus, response.data);
                if (response.data.provider === 'asaas') this.fetchAsaasStatus();
            }).catch(() => {});

            setTimeout(() => {
                this.systemLoading = false;
            }, 500)
        }).catch(() => { this.initializationError = 'Não foi possível carregar o sistema. Verifique a conexão com a API e tente novamente.'; });
    }
}
</script>

<style>
.receiving-reminder { padding: 14px 18px; margin-bottom: 22px; border: 1px solid #dfe9d5; border-radius: 10px; background: #f7fbf3; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; color: #859475; font-size: 12px; }
.receiving-reminder strong, .receiving-reminder a { color: #567c3f; }
.sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 300px;
    border-right: 1px solid var(--cinza-medio);
    transition: transform 0.4s;
    z-index: 2;
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
    }

    .sidebar {
        height: calc(100vh - 60px);
        top: 60px;
    }

    .slot {
        transform: translateX(-300px);
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
