<template>
    <section>
        <UtilsPageheader title="Assistente" subtitle="Tire dúvidas e peça ajuda à IA. Qualquer alteração só acontece depois que você confirmar." />

        <UtilsLoading :loading="booting" />

        <div class="empty-state text-center" v-if="!booting && status === 'disabled'" role="status">
            <h2>O assistente não está disponível para esta empresa</h2>
            <p class="fontsize-md cinza mt-4">Este recurso está desligado no momento.</p>
        </div>

        <div class="empty-state text-center" v-else-if="!booting && status !== 'enabled'" role="alert">
            <h2>{{ $assistant.state.statusMessage || 'O assistente não respondeu agora.' }}</h2>
            <button type="button" class="btn btn-primary mt-4 mx-auto" v-on:click="boot(true)">Tentar novamente</button>
        </div>

        <template v-else-if="!booting">
            <UtilsTabs v-if="tabs.length > 1" :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'assistente', tabs)" />
            <NuxtPage />
        </template>
    </section>
</template>

<script>
export default {
    data() {
        const path = this.$route.path;
        const admin = this.$myFunctions.hasPermission(this);
        const active = admin && (path === "/assistente/conhecimento" || path.startsWith("/assistente/conhecimento/")) ? "conhecimento" : "conversa";
        const tabs = [{ name: "Conversa", quantity: null, route: "conversa", default: active === "conversa" }];
        // A base de conhecimento é só de administradores: quem não é admin nem vê a aba.
        if (admin) tabs.push({ name: "Base de conhecimento", quantity: null, route: "conhecimento", default: active === "conhecimento" });
        return { tabs, booting: true };
    },
    computed: {
        status() { return this.$assistant.state.status; }
    },
    mounted() {
        this.boot(false);
    },
    methods: {
        async boot(force) {
            this.booting = true;
            try {
                // A sonda é GET /assistant/status: já traz plano, cota e o que o usuário pode fazer (antes da 1ª mensagem).
                await this.$assistant.probe(force);
            } finally {
                this.booting = false;
            }
            // Com o recurso ligado e sem aba escolhida, cai na conversa (o Tabs navega ao montar).
            if (this.$assistant.state.status === "enabled" && this.$route.path === "/assistente") {
                this.$router.replace("/assistente/conversa");
            }
        }
    }
}
</script>

<script setup>
// Visível a qualquer membro; a base de conhecimento (aba e rota) é restrita a administradores.
definePageMeta({ access: 'member', title: 'Assistente' })
</script>
