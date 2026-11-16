<template>
    <div class="conv-list">
        <button type="button" class="btn btn-primary conv-new" :disabled="disabled" v-on:click="$emit('new')">
            <font-awesome icon="plus" aria-hidden="true" /> Nova conversa
        </button>

        <UtilsLoading :loading="loading" />

        <p class="conv-state fontsize-md cinza" v-if="!loading && !items.length" role="status">
            Nenhuma conversa ainda. Escreva sua primeira pergunta para começar.
        </p>

        <ul class="conv-items" v-if="items.length" aria-label="Conversas com o assistente">
            <li class="conv-row" v-for="c in items" :key="c.id">
                <button type="button" class="conv-item" :class="{ active: c.id === activeId }" :disabled="disabled"
                    :aria-current="c.id === activeId ? 'true' : 'false'" v-on:click="$emit('select', c.id)">
                    <span class="conv-top">
                        <strong class="conv-name">{{ label(c) }}</strong>
                        <span class="conv-time fontsize-sm cinza">{{ when(c) }}</span>
                    </span>
                    <span class="conv-count fontsize-sm cinza">{{ count(c) }}</span>
                </button>
                <button type="button" class="conv-delete" :class="{ 'btn-loading': c.id === deletingId }"
                    :disabled="disabled || !!deletingId" :aria-label="'Apagar conversa: ' + label(c)"
                    :title="'Apagar conversa'" v-on:click="$emit('delete', c.id)">
                    <font-awesome icon="trash-can" aria-hidden="true" />
                </button>
            </li>
        </ul>
    </div>
</template>

<script>
import { conversationLabel, formatListWhen } from '../../utils/assistant.js';

export default {
    props: {
        items: { type: Array, default: () => [] },
        activeId: { type: String, default: "" },
        loading: { type: Boolean, default: false },
        // Trocar de conversa no meio de um envio faria o histórico mudar embaixo da resposta.
        disabled: { type: Boolean, default: false },
        // Conversa sendo apagada agora (só uma por vez).
        deletingId: { type: String, default: "" }
    },
    // "delete" só pede a exclusão: a confirmação com o usuário e a chamada ao core ficam na página/controlador.
    emits: ["select", "new", "delete"],
    methods: {
        label(c) { return conversationLabel(c); },
        when(c) { return formatListWhen(c.updatedAt || c.createdAt); },
        count(c) {
            const n = c.messageCount || 0;
            return n === 1 ? "1 mensagem" : n + " mensagens";
        }
    }
}
</script>

<style scoped>
.conv-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
}

.conv-new {
    width: 100%;
}

.conv-state {
    padding: var(--space-4);
}

.conv-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    overflow-y: auto;
    max-height: 480px;
}

.conv-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
}

.conv-delete {
    transition: background-color var(--motion-fast) var(--ease-standard);
    flex: none;
    width: 44px;
    min-height: 44px;
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    background: var(--branco);
    color: var(--vermelho);
    cursor: pointer;
}

.conv-delete:hover:not(:disabled) {
    background: var(--amarelo-claro);
}

.conv-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.conv-item {
    flex: 1;
    min-width: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
    padding: var(--space-4);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    background: var(--branco);
    cursor: pointer;
    transition: background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard);
}

.conv-item:hover:not(:disabled),
.conv-item.active {
    background: var(--azul-claro);
}

.conv-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.conv-top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
}

.conv-name {
    min-width: 0;
    overflow-wrap: anywhere;
}

.conv-time {
    flex: none;
}
@media (max-width: 900px) {
    .conv-items {
        max-height: 220px;
    }
}
</style>
