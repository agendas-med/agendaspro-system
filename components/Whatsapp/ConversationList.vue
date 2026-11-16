<template>
    <div class="conv-list">
        <div class="input-group conv-filter">
            <label for="wa-conv-filter" class="fontsize-sm cinza">Filtrar conversas</label>
            <select id="wa-conv-filter" :value="filter" v-on:change="$emit('filter', $event.target.value)">
                <option v-for="f in filters" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
        </div>

        <UtilsLoading :loading="loading" />

        <div v-if="error && !loading" class="conv-state" role="alert">
            <p>{{ error }}</p>
            <button type="button" class="btn btn-primary" v-on:click="$emit('retry')">Tentar novamente</button>
        </div>

        <p class="conv-state fontsize-md cinza" v-else-if="!loading && !items.length" role="status">
            {{ emptyText }}
        </p>

        <ul class="conv-items" v-if="!loading && !error && items.length" aria-label="Conversas do WhatsApp">
            <li v-for="c in items" :key="c.id">
                <button type="button" class="conv-item" :class="{ active: c.id === selectedId }"
                    :aria-current="c.id === selectedId ? 'true' : 'false'" v-on:click="$emit('select', c.id)">
                    <span class="conv-top">
                        <strong class="conv-name">{{ c.name }}</strong>
                        <span class="conv-time fontsize-sm cinza">{{ listTime(c) }}</span>
                    </span>
                    <span class="conv-preview fontsize-sm cinza">{{ preview(c) }}</span>
                    <span class="tag fontsize-sm" :class="tag(c).tone">{{ tag(c).label }}</span>
                </button>
            </li>
        </ul>

        <button type="button" class="btn btn-cinza conv-more" v-if="!loading && !error && hasMore"
            :class="{ 'btn-loading': loadingMore }" :disabled="loadingMore" v-on:click="$emit('more')">
            Carregar mais conversas
        </button>
    </div>
</template>

<script>
import { CONVERSATION_FILTERS, categoryTag, formatListTime } from '../../utils/whatsapp.js';

export default {
    props: {
        items: { type: Array, default: () => [] },
        filter: { type: String, default: "all" },
        selectedId: { type: Number, default: null },
        loading: { type: Boolean, default: false },
        loadingMore: { type: Boolean, default: false },
        hasMore: { type: Boolean, default: false },
        error: { type: String, default: "" }
    },
    emits: ["select", "filter", "more", "retry"],
    data() {
        return { filters: CONVERSATION_FILTERS };
    },
    computed: {
        emptyText() {
            return this.filter === "all"
                ? "Nenhuma conversa ainda. Quando um cliente escrever para o número da plataforma, ela aparece aqui."
                : "Nenhuma conversa neste filtro.";
        }
    },
    methods: {
        tag(c) {
            return categoryTag(c.category);
        },
        listTime(c) {
            return formatListTime(c.lastMessageAt);
        },
        preview(c) {
            const m = c.lastMessage;
            if (!m || !m.body) return "Sem mensagens";
            const prefix = m.direction !== "out" ? "" : m.author === "bot" ? "Bot: " : "Atendente: ";
            return prefix + m.body;
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

.conv-filter select {
    height: 44px;
}

.conv-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-4);
    padding: var(--space-4);
}

.conv-state .btn {
    width: auto;
}

.conv-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.conv-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: var(--space-4);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    background: var(--branco);
    cursor: pointer;
}

.conv-item:hover {
    background: var(--cinza-claro);
}

.conv-item.active {
    border-color: var(--verde-escuro);
    box-shadow: var(--boxshadow-default);
}

.conv-top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
}

.conv-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.conv-time {
    flex: none;
}

.conv-preview {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
}

.conv-more {
    width: 100%;
    max-width: none;
}
</style>
