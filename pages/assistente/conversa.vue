<template>
    <section class="assistant-layout">
        <aside class="assistant-side" aria-label="Histórico de conversas">
            <AssistantConversationList :items="state.conversations" :active-id="state.activeId"
                :loading="state.conversationsLoading && !state.conversations.length" :disabled="busy"
                @select="open" @new="$assistant.startNew()" />
        </aside>
        <AssistantChatPanel class="assistant-main" />
    </section>
</template>

<script>
export default {
    computed: {
        state() { return this.$assistant.state; },
        busy() { return this.state.sending || this.state.recovering; }
    },
    mounted() {
        // A sonda já traz a lista; se por algum motivo estiver vazia, atualiza (sem erro em tela: o histórico é secundário).
        if (!this.state.conversations.length) this.$assistant.refreshConversations();
    },
    methods: {
        open(id) {
            if (id !== this.state.activeId) this.$assistant.openConversation(id);
        }
    }
}
</script>

<style scoped>
.assistant-layout {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
}

@media (max-width: 900px) {
    .assistant-layout {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'Assistente - Conversa' })
</script>
