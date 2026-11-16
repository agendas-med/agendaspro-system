<template>
    <section>
        <UtilsPageheader title="Financeiro" subtitle="Organize as finanças do seu negócio com facilidade." />
        <UtilsTabs :tabs="tabs" @changedTab="$myFunctions.goToSubRoute($.proxy, $event, 'financeiro', tabs)" />
        <NuxtPage :transition="{ name: 'tab-swap', mode: 'out-in' }" />
    </section>
</template>
<script>
export default {
    data() {
        return {
            tabs: [
                {
                    name: "Pagamentos",
                    quantity: null,
                    route: "pagamentos",
                    default: true
                }
                // A aba "Métodos de pagamento" volta junto com a F2 (cobrança); a rota ainda não existe.
            ]
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'admin', title: 'Financeiro' })
</script>
