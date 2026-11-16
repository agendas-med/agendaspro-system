<template>
    <section>
        <UtilsPageheader title="Profissionais" subtitle="Cadastre quem atende, os horários de cada um e os bloqueios da agenda." />
        <UtilsTabs :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'profissionais', tabs)" />
        <NuxtPage :transition="{ name: 'tab-swap', mode: 'out-in' }" />
    </section>
</template>

<script>
export default {
    data() {
        const path = this.$route.path;
        const routes = ["lista", "bloqueios"];
        const active = routes.find((r) => path === "/profissionais/" + r || path.startsWith("/profissionais/" + r + "/")) || "lista";
        return {
            tabs: [
                { name: "Equipe", quantity: null, route: "lista", default: active === "lista" },
                { name: "Bloqueios e feriados", quantity: null, route: "bloqueios", default: active === "bloqueios" }
            ]
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Profissionais' })
</script>
