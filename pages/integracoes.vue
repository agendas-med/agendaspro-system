<template>
    <section>
        <UtilsPageheader title="Integrações" subtitle="Conecte o Instagram e o Google Agenda para atrair clientes e manter a agenda em dia." />

        <UtilsLoading :loading="booting" />

        <div class="empty-state text-center" v-if="!booting && failed" role="alert">
            <h2>{{ failed }}</h2>
            <button type="button" class="btn btn-primary mt-4 mx-auto" v-on:click="boot()">Tentar novamente</button>
        </div>

        <div class="empty-state text-center" v-else-if="!booting && !tabs.length" role="status">
            <h2>Nenhuma integração está disponível agora</h2>
            <p class="fontsize-md cinza mt-4">Este recurso está desligado no momento.</p>
        </div>

        <template v-else-if="!booting">
            <UtilsTabs v-if="tabs.length > 1" :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'integracoes', tabs)" />
            <NuxtPage />
        </template>
    </section>
</template>

<script>
const ROUTES = [
    { name: "Instagram", route: "instagram", key: "$instagram" },
    { name: "Google Agenda", route: "google-agenda", key: "$googleCalendar" }
];

export default {
    data() {
        return { booting: true, failed: "" };
    },
    computed: {
        // Só aparecem as integrações que o servidor oferece (core sem a F6 responde 404 e a aba some).
        tabs() {
            const path = this.$route.path;
            const list = ROUTES.filter((r) => this[r.key].state.available === "yes");
            const current = list.find((r) => path === "/integracoes/" + r.route || path.startsWith("/integracoes/" + r.route + "/")) || list[0];
            return list.map((r) => ({ name: r.name, quantity: null, route: r.route, default: !!current && current.route === r.route }));
        }
    },
    mounted() {
        this.boot();
    },
    methods: {
        async boot() {
            this.booting = true;
            this.failed = "";
            try {
                await Promise.all([this.$instagram.loadStatus({ force: true }), this.$googleCalendar.loadStatus({ force: true })]);
            } finally {
                this.booting = false;
            }
            const errors = ROUTES.map((r) => this[r.key].state).filter((s) => s.error && s.available !== "yes");
            if (errors.length === ROUTES.length) {
                this.failed = errors[0].error.message || "Não foi possível carregar as integrações.";
                return;
            }
            // Com mais de uma integração e nenhuma aba escolhida, o Tabs navega ao montar; com uma só, vai direto.
            if (this.$route.path === "/integracoes" && this.tabs.length === 1) {
                this.$router.replace("/integracoes/" + this.tabs[0].route);
            }
        }
    }
}
</script>

<script setup>
// Visível a qualquer membro; conectar, desconectar e sincronizar são ações do administrador (os componentes conferem).
definePageMeta({ access: 'member', title: 'Integrações' })
</script>
