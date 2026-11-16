<template>
    <div class="cta" role="note">
        <p class="fontsize-md-bold preto"><font-awesome icon="lock" aria-hidden="true" /> {{ title }}</p>
        <p class="fontsize-md cinza">{{ text }}</p>
        <button type="button" class="btn btn-primary btn-auto" v-if="isAdmin" v-on:click="$router.push('/billing/plano')">Conhecer o Premium</button>
        <p class="fontsize-sm cinza" v-else>Peça ao administrador da empresa para mudar de plano.</p>
    </div>
</template>

<script>
// Convite ao Premium para blocos bloqueados (402). Somente admin vê o botão que leva aos planos.
export default {
    props: {
        title: { type: String, default: "Disponível no plano Premium" },
        text: { type: String, default: "" }
    },
    computed: {
        isAdmin() { return this.$myFunctions.hasPermission(this); }
    }
}
</script>

<style scoped>
.cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px dashed var(--amarelo);
    background: var(--amarelo-claro);
    border-radius: var(--radius-md);
}
</style>
