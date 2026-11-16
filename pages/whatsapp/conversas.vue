<template>
    <section class="inbox" :class="{ 'has-selection': selectedId !== null }">
        <aside class="inbox-list" aria-label="Lista de conversas">
            <WhatsappConversationList :items="visibleItems" :filter="filter" :selected-id="selectedId" :loading="loading"
                :loading-more="loadingMore" :has-more="hasMore" :error="loadError" @select="select" @filter="changeFilter"
                @more="loadMore" @retry="load()" />
        </aside>

        <div class="inbox-thread">
            <WhatsappThread v-if="selectedId !== null" ref="thread" :key="selectedId" :conversation-id="selectedId"
                :current-user-id="$global.user.id" :company-name="$global.company.name" @back="selectedId = null"
                @updated="onThreadUpdated" @not-found="onNotFound" />
            <div class="inbox-placeholder fontsize-md cinza" v-else role="status">
                <p>Selecione uma conversa para ver as mensagens e responder.</p>
            </div>
        </div>
    </section>
</template>

<script>
import {
    CONVERSATION_PAGE_SIZE, applyConversationRefresh, appendConversations, conversationQuery, createPoller,
    filterConversations, normalizeConversations, refreshLimit, sortConversations, POLL_INTERVAL_MS
} from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

export default {
    data() {
        return {
            filter: "all",
            loaded: [],          // conversas já carregadas (filtradas só pelo servidor)
            serverOffset: 0,
            hasMore: false,
            loading: true,
            loadingMore: false,
            loadError: "",
            selectedId: null,
            requestToken: 0,
            poller: null,
            onVisibility: null
        };
    },
    computed: {
        // "Aguardando", "assumidas" e "opt-out" não existem no servidor: refinadas aqui.
        visibleItems() {
            return filterConversations(this.loaded, this.filter);
        }
    },
    mounted() {
        this.load();
        this.poller = createPoller({
            intervalMs: POLL_INTERVAL_MS,
            isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
            task: () => this.poll()
        });
        this.onVisibility = () => this.poller && this.poller.notifyVisibility();
        document.addEventListener("visibilitychange", this.onVisibility);
        this.poller.start();
    },
    beforeUnmount() {
        if (this.poller) this.poller.stop();
        if (this.onVisibility) document.removeEventListener("visibilitychange", this.onVisibility);
        this.requestToken += 1;
    },
    methods: {
        async load() {
            const token = ++this.requestToken;
            this.loading = true;
            this.loadError = "";
            try {
                const res = await this.$base.api.get("/whatsapp/conversations", { params: conversationQuery(this.filter) });
                if (token !== this.requestToken) return;
                const raw = unwrap(res) || [];
                this.loaded = sortConversations(normalizeConversations(raw));
                this.serverOffset = raw.length;
                this.hasMore = raw.length >= CONVERSATION_PAGE_SIZE;
            } catch (error) {
                if (token !== this.requestToken) return;
                this.loaded = [];
                this.hasMore = false;
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar as conversas.");
            } finally {
                if (token === this.requestToken) this.loading = false;
            }
        },
        async loadMore() {
            if (this.loadingMore) return;
            const token = this.requestToken;
            this.loadingMore = true;
            try {
                const res = await this.$base.api.get("/whatsapp/conversations", {
                    params: conversationQuery(this.filter, { offset: this.serverOffset })
                });
                if (token !== this.requestToken) return;
                const raw = unwrap(res) || [];
                this.loaded = appendConversations(this.loaded, normalizeConversations(raw));
                this.serverOffset += raw.length;
                this.hasMore = raw.length >= CONVERSATION_PAGE_SIZE;
            } catch (error) {
                if (token === this.requestToken) this.$myFunctions.notifyError(this, error, "Não foi possível carregar mais conversas.");
            } finally {
                this.loadingMore = false;
            }
        },
        // Rodada do polling (15 s, só com a aba visível): lista + conversa aberta, em silêncio.
        async poll() {
            // O selo do menu/aba acompanha a tela aberta (uma chamada leve, junta com a do menu se coincidir).
            const tasks = [this.refreshList(), this.$whatsappBadge.refresh()];
            if (this.$refs.thread && typeof this.$refs.thread.refresh === "function") tasks.push(this.$refs.thread.refresh());
            await Promise.all(tasks);
        },
        async refreshList() {
            if (this.loading || this.loadingMore) return;
            const token = this.requestToken;
            const limit = refreshLimit(this.loaded.length);
            try {
                const res = await this.$base.api.get("/whatsapp/conversations", {
                    params: conversationQuery(this.filter, { limit })
                });
                if (token !== this.requestToken) return;
                const raw = unwrap(res) || [];
                const incoming = normalizeConversations(raw);
                const replaced = this.loaded.length <= limit;
                this.loaded = applyConversationRefresh(this.loaded, incoming, limit);
                if (replaced) {
                    this.serverOffset = raw.length;
                    this.hasMore = raw.length >= limit;
                }
            } catch (error) {
                // silencioso: a próxima rodada tenta de novo
            }
        },
        changeFilter(value) {
            if (value === this.filter) return;
            this.filter = value;
            this.load();
        },
        select(id) {
            this.selectedId = id;
        },
        // A conversa aberta mudou (assumir, envio, atualização): reflete na lista sem esperar o polling.
        onThreadUpdated(conv) {
            this.$whatsappBadge.refresh();
            const index = this.loaded.findIndex((c) => c.id === conv.id);
            if (index === -1) return;
            const next = [...this.loaded];
            next[index] = { ...next[index], ...conv, lastMessage: conv.lastMessage || next[index].lastMessage };
            this.loaded = sortConversations(next);
        },
        onNotFound() {
            this.$myFunctions.showToast(this, "Esta conversa não existe mais ou não pertence à sua empresa.", "error");
            this.selectedId = null;
            this.load();
        }
    }
}
</script>

<style scoped>
.inbox {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
}

.inbox-list {
    min-width: 0;
}

.inbox-thread {
    min-width: 0;
}

.inbox-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 320px;
    padding: var(--space-6);
    border: 1px dashed var(--cinza-medio);
    border-radius: var(--radius-lg);
    text-align: center;
}

@media (max-width: 900px) {
    .inbox {
        grid-template-columns: minmax(0, 1fr);
    }

    /* No celular: ou a lista, ou a conversa. */
    .inbox.has-selection .inbox-list {
        display: none;
    }

    .inbox:not(.has-selection) .inbox-thread {
        display: none;
    }
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'WhatsApp - Conversas' })
</script>
