<template>
    <div class="profile">
        <img class="avatar" :src="account.pictureUrl" alt="" width="64" height="64" referrerpolicy="no-referrer" loading="lazy" v-if="account.pictureUrl" />
        <span class="avatar placeholder" aria-hidden="true" v-else><font-awesome :icon="['fab', 'instagram']" /></span>
        <div class="who">
            <p class="fontsize-md-bold preto">{{ account.name || ("@" + account.username) }}</p>
            <p class="fontsize-md cinza" v-if="account.username">@{{ account.username }}</p>
        </div>
        <dl class="counts">
            <div><dt class="fontsize-sm cinza">Seguidores</dt><dd class="fontsize-md-bold preto">{{ count(account.followers) }}</dd></div>
            <div><dt class="fontsize-sm cinza">Seguindo</dt><dd class="fontsize-md-bold preto">{{ count(account.follows) }}</dd></div>
            <div><dt class="fontsize-sm cinza">Publicações</dt><dd class="fontsize-md-bold preto">{{ count(account.mediaCount) }}</dd></div>
        </dl>
    </div>
</template>

<script>
import { formatCount } from '../../utils/instagram.js';

// Perfil conectado. Nome e usuário vêm do Instagram e são exibidos como texto puro.
export default {
    props: { account: { type: Object, required: true } },
    methods: { count: formatCount }
}
</script>

<style scoped>
.profile {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-5);
}

.avatar {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-full);
    object-fit: cover;
    background: var(--cinza-claro);
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cinza);
    font-size: 1.5rem;
}

.who {
    flex: 1 1 160px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.counts {
    display: flex;
    gap: var(--space-6);
    margin: 0;
}

.counts dd {
    margin: 0;
}
</style>
