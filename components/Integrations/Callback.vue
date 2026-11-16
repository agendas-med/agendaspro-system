<template>
    <section class="ui-card int-card" aria-live="polite">
        <template v-if="status === 'error'">
            <h2 class="fontsize-md-bold preto" role="alert">Não foi possível conectar {{ name }}</h2>
            <p class="fontsize-md cinza">{{ message }}</p>
            <div class="int-actions">
                <button type="button" class="btn btn-primary" v-on:click="back()">Voltar às integrações</button>
            </div>
        </template>
        <template v-else>
            <h2 class="fontsize-md-bold preto">Concluindo a conexão com {{ name }}…</h2>
            <p class="fontsize-md cinza" role="status">Isso leva só alguns segundos.</p>
        </template>
    </section>
</template>

<script>
// Retorno do OAuth. A query (code/state) é capturada e removida da URL ANTES de qualquer chamada;
// o controlador garante que o mesmo state nunca dispara duas vezes.
export default {
    props: {
        provider: { type: String, required: true }, // 'instagram' | 'googleCalendar'
        name: { type: String, required: true },
        returnPath: { type: String, required: true }
    },
    computed: {
        controller() { return this.provider === 'instagram' ? this.$instagram : this.$googleCalendar; },
        status() { return this.controller.state.callback.status; },
        message() { return this.controller.state.callback.message; }
    },
    mounted() {
        this.run();
    },
    methods: {
        async run() {
            const query = { ...this.$route.query };
            await this.$router.replace({ path: this.$route.path, query: {} });
            const result = await this.controller.completeCallback(query);
            if (result.ok) {
                this.controller.state.notice = { kind: 'info', message: this.name + ' conectado.' };
                this.$router.replace(this.returnPath);
            }
        },
        back() {
            this.controller.state.callback = { status: 'idle', message: '' };
            this.$router.replace(this.returnPath);
        }
    }
}
</script>
