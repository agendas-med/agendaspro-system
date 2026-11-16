<template>
    <section>
        <UtilsPageheader title="WhatsApp" subtitle="Atenda seus clientes, acompanhe o bot e veja o uso de mensagens do mês." />
        <UtilsTabs :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'whatsapp', tabs)" />
        <NuxtPage />
    </section>
</template>

<script>
import { badgeLabel, badgeText, waitingCount } from '../utils/whatsappBadge.js';

export default {
    data() {
        const path = this.$route.path;
        const routes = ["conversas", "configuracao"];
        const active = routes.find((r) => path === "/whatsapp/" + r || path.startsWith("/whatsapp/" + r + "/")) || "conversas";
        return { active };
    },
    computed: {
        // Selo (mesma contagem do menu): conversas aguardando atendimento; some quando é zero.
        tabs() {
            const waiting = waitingCount(this.$whatsappBadge.state.summary);
            return [
                { name: "Conversas", quantity: badgeText(waiting) || null, srLabel: badgeLabel(waiting), route: "conversas", default: this.active === "conversas" },
                { name: "Configuração e uso", quantity: null, route: "configuracao", default: this.active === "configuracao" }
            ];
        }
    }
}
</script>

<script setup>
// Visível a qualquer membro (atendimento); a configuração é restrita a administradores dentro da página.
definePageMeta({ access: 'member', title: 'WhatsApp' })
</script>
