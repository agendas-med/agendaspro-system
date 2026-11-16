<template>
    <section class="assistant-layout">
        <aside class="assistant-side" aria-label="Histórico de conversas">
            <AssistantConversationList :items="state.conversations" :active-id="state.activeId"
                :loading="state.conversationsLoading && !state.conversations.length" :disabled="busy"
                :deleting-id="state.deletingId" @select="open" @new="$assistant.startNew()" @delete="remove" />
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
        },
        // Apagar é definitivo (o core remove a conversa e expira ações pendentes): só depois de confirmar.
        async remove(id) {
            if (this.busy || this.state.deletingId) return;
            const ok = await this.$myFunctions.confirmDialog({
                title: "Apagar conversa",
                message: "A conversa e as propostas pendentes dela serão apagadas. Esta ação não pode ser desfeita.",
                confirmLabel: "Apagar",
                danger: true
            });
            if (!ok) return;
            const r = await this.$assistant.deleteConversation(id);
            if (r.ok) this.$myFunctions.showToast(this, "Conversa apagada.", "success");
            else if (r.error) this.$myFunctions.showToast(this, r.error, "error");
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
