<template>
    <section>
        <UtilsPageheader title="Plano e cobrança" subtitle="Escolha seu plano, acompanhe as faturas e as comissões das vendas." />
        <UtilsTabs :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'billing', tabs)" />
        <NuxtPage />
    </section>
</template>

<script>
export default {
    data() {
        const path = this.$route.path;
        const routes = ["plano", "faturas", "recebimentos"];
        const active = routes.find((r) => path === "/billing/" + r || path.startsWith("/billing/" + r + "/")) || "plano";
        return {
            tabs: [
                { name: "Plano", quantity: null, route: "plano", default: active === "plano" },
                { name: "Faturas", quantity: null, route: "faturas", default: active === "faturas" },
                { name: "Comissões", quantity: null, route: "recebimentos", default: active === "recebimentos" }
            ]
        }
    }
}
</script>

<script setup>
// Plano visível a qualquer membro; faturas e comissões exigem admin (definido em cada página filha).
definePageMeta({ access: 'member', title: 'Plano e cobrança' })
</script>
