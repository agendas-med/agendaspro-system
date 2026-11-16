<template>
    <section class="ui-card int-card" :aria-labelledby="id">
        <header class="ui-card-header">
            <h2 class="fontsize-md-bold preto" :id="id">{{ title }}</h2>
            <slot name="actions" />
        </header>
        <div v-if="block.status === 'loading'">
            <p class="fontsize-md cinza" role="status">Carregando…</p>
            <div class="skeleton-lines" aria-hidden="true">
                <span class="skeleton"></span>
                <span class="skeleton"></span>
                <span class="skeleton"></span>
            </div>
        </div>
        <IntegrationsUpgradeCta v-else-if="block.status === 'locked'" :title="lockedTitle" :text="lockedText" />
        <div v-else-if="block.status === 'error'" role="alert" class="err">
            <p class="fontsize-md preto">{{ block.message || "Não foi possível carregar este bloco." }}</p>
            <button type="button" class="btn btn-cinza btn-auto" v-on:click="$emit('retry')">Tentar novamente</button>
        </div>
        <p class="fontsize-md cinza" v-else-if="empty">{{ emptyText }}</p>
        <slot v-else />
    </section>
</template>

<script>
// Casca de um bloco da tela com seus próprios estados (carregando, bloqueado pelo plano, erro, vazio).
// Um erro aqui não derruba os outros blocos da página.
export default {
    props: {
        id: { type: String, required: true },
        title: { type: String, required: true },
        block: { type: Object, required: true },
        empty: { type: Boolean, default: false },
        emptyText: { type: String, default: "Nada por aqui ainda." },
        lockedTitle: { type: String, default: "Disponível no plano Premium" },
        lockedText: { type: String, default: "" }
    },
    emits: ["retry"]
}
</script>

<style scoped>
.skeleton-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-4);
}

.skeleton-lines .skeleton {
    height: 14px;
}

.skeleton-lines .skeleton:nth-child(2) {
    width: 80%;
}

.skeleton-lines .skeleton:nth-child(3) {
    width: 55%;
}

.err {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
}
</style>
