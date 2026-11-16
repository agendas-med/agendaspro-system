<template>
    <section class="assistant-layout">
        <aside class="assistant-side" :class="{ 'is-open': listOpen }" aria-label="Histórico de conversas">
            <!-- No celular a lista começa recolhida, acima do chat; no desktop o botão some e a lista fica sempre à vista. -->
            <button type="button" class="side-toggle fontsize-md" aria-controls="assistant-conversations"
                :aria-expanded="listOpen ? 'true' : 'false'" v-on:click="listOpen = !listOpen">
                <span>Conversas{{ state.conversations.length ? " (" + state.conversations.length + ")" : "" }}</span>
                <font-awesome icon="angle-down" class="side-chevron" aria-hidden="true" />
            </button>
            <div id="assistant-conversations" class="side-body">
                <AssistantConversationList :items="state.conversations" :active-id="state.activeId"
                    :loading="state.conversationsLoading && !state.conversations.length" :disabled="busy"
                    :deleting-id="state.deletingId" @select="open" @new="startNew" @delete="remove" />
            </div>
        </aside>
        <AssistantChatPanel class="assistant-main" />
    </section>
</template>

<script>
export default {
    data() {
        return { listOpen: false };
    },
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
            this.listOpen = false;
            if (id !== this.state.activeId) this.$assistant.openConversation(id);
        },
        startNew() {
            this.listOpen = false;
            this.$assistant.startNew();
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
            // Em caso de falha o controlador já deixa o aviso na tela do chat (sem duplicar com outro toast).
            if (r.ok) this.$myFunctions.showToast(this, "Conversa apagada.", "success");
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

.side-toggle {
    display: none;
}

@media (max-width: 900px) {
    .assistant-layout {
        grid-template-columns: minmax(0, 1fr);
    }

    .side-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 44px;
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--cinza-medio);
        border-radius: var(--radius-md);
        background: var(--branco);
        font-weight: 600;
        cursor: pointer;
    }

    .side-chevron {
        transition: transform var(--motion-base) var(--ease-out);
    }

    .assistant-side.is-open .side-chevron {
        transform: rotate(180deg);
    }

    .side-body {
        display: none;
        margin-top: var(--space-3);
    }

    .assistant-side.is-open .side-body {
        display: block;
    }
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'Assistente - Conversa' })
</script>
