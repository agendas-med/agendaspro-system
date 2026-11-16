<template>
    <div class="ig-page">
        <IntegrationsNotice :notice="state.notice" v-on:dismiss="$instagram.clearNotice()" />

        <InstagramConnectionCard />

        <template v-if="view === 'connected'">
            <InstagramPostsGrid />
            <InstagramEngagement :engagement="state.engagement" />
            <InstagramInsights :insights="state.insights" :block="state.blocks.insights" :premium="state.premium === true"
                :days="state.days" v-on:retry="$instagram.loadDashboard()" v-on:period="$instagram.setPeriod($event)" />
            <InstagramFunnel :conversion="state.conversion" :block="state.blocks.conversion" v-on:retry="$instagram.loadDashboard()" />
            <InstagramUtmGenerator />
        </template>
    </div>
</template>

<script>
export default {
    computed: {
        state() { return this.$instagram.state; },
        view() { return this.$instagram.view(); }
    },
    mounted() {
        this.$instagram.load();
    },
    watch: {
        // Conectou (ou voltou do OAuth) com a tela já aberta: carrega o painel.
        "$instagram.state.connected"(connected) {
            if (connected) this.$instagram.loadDashboard();
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'member', title: 'Instagram' })
</script>
