<template>
    <section>
        <UtilsPageheader title="WhatsApp" subtitle="Atenda seus clientes, acompanhe o bot e veja o uso de mensagens do mês." />
        <UtilsTabs :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'whatsapp', tabs)" />
        <NuxtPage />
    </section>
</template>

<script>
export default {
    data() {
        const path = this.$route.path;
        const routes = ["conversas", "configuracao"];
        const active = routes.find((r) => path === "/whatsapp/" + r || path.startsWith("/whatsapp/" + r + "/")) || "conversas";
        return {
            tabs: [
                { name: "Conversas", quantity: null, route: "conversas", default: active === "conversas" },
                { name: "Configuração e uso", quantity: null, route: "configuracao", default: active === "configuracao" }
            ]
        }
    }
}
</script>

<script setup>
// Visível a qualquer membro (atendimento); a configuração é restrita a administradores dentro da página.
definePageMeta({ access: 'member', title: 'WhatsApp' })
</script>
