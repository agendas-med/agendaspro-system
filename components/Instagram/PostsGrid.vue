<template>
    <IntegrationsBlock id="ig-posts" title="Últimas publicações" :block="state.blocks.posts" :empty="state.blocks.posts.status === 'ready' && !visible.length"
        empty-text="Nenhuma publicação encontrada nesta conta ainda." v-on:retry="$instagram.loadDashboard()">
        <ul class="posts">
            <li class="post" v-for="post in visible" :key="post.id">
                <div class="thumb">
                    <img :src="post.thumbnail" alt="" loading="lazy" referrerpolicy="no-referrer" v-if="post.thumbnail" />
                    <span class="no-thumb fontsize-sm cinza" v-else>Sem imagem</span>
                    <span class="type tag">{{ typeLabel(post.type) }}</span>
                </div>
                <p class="caption fontsize-md preto" v-if="post.caption">{{ post.caption }}</p>
                <p class="caption fontsize-md cinza" v-else>Sem legenda</p>
                <p class="metrics fontsize-sm cinza">
                    <span><font-awesome icon="heart" aria-hidden="true" /> {{ count(post.likes) }} <span class="int-sr-only">curtidas</span></span>
                    <span><font-awesome icon="comment" aria-hidden="true" /> {{ count(post.comments) }} <span class="int-sr-only">comentários</span></span>
                    <span class="date">{{ when(post.postedAt) }}</span>
                </p>
                <a class="fontsize-sm" :href="post.permalink" target="_blank" rel="noopener noreferrer" v-if="post.permalink">
                    Abrir no Instagram <span class="int-sr-only">(abre em nova aba)</span>
                    <font-awesome icon="arrow-up-right-from-square" aria-hidden="true" />
                </a>
            </li>
        </ul>
        <div class="int-actions" v-if="canLoadMore">
            <button type="button" class="btn btn-cinza btn-auto" :disabled="state.loadingMorePosts"
                :class="{ 'btn-loading': state.loadingMorePosts }" v-on:click="$instagram.loadMorePosts()">Ver mais publicações</button>
        </div>
        <IntegrationsUpgradeCta v-if="showCta" title="Veja todas as publicações no Premium"
            :text="'O plano gratuito mostra as ' + limit + ' publicações mais recentes. No Premium você navega por todo o histórico e compara o desempenho de cada post.'" />
    </IntegrationsBlock>
</template>

<script>
import { formatCount, mediaTypeLabel, FREE_POSTS_LIMIT } from '../../utils/instagram.js';
import { formatShortDate } from '../../utils/integrations.js';

// Grade das últimas publicações. Legenda e links vêm do Instagram: texto puro e somente https.
export default {
    computed: {
        state() { return this.$instagram.state; },
        limit() { return FREE_POSTS_LIMIT; },
        free() { return this.state.premium === false; },
        visible() {
            const items = this.state.posts.items;
            return this.free ? items.slice(0, FREE_POSTS_LIMIT) : items;
        },
        canLoadMore() { return !this.free && !!this.state.posts.nextBefore; },
        showCta() { return this.free && (this.state.posts.items.length >= FREE_POSTS_LIMIT || !!this.state.posts.nextBefore); }
    },
    methods: {
        count: formatCount,
        typeLabel: mediaTypeLabel,
        when(value) { return value ? formatShortDate(value) : ''; }
    }
}
</script>

<style scoped>
.posts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-5);
}

.post {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
}

.thumb {
    position: relative;
    aspect-ratio: 1 / 1;
    border-radius: var(--radius-md);
    background: var(--cinza-claro);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.type {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
}

.caption {
    overflow-wrap: anywhere;
}

.metrics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
}

.date {
    margin-left: auto;
}
</style>
