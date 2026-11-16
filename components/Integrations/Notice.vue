<template>
    <div class="ui-notice int-notice" :class="noticeClass" :role="notice.kind === 'error' ? 'alert' : 'status'" v-if="notice">
        <p class="fontsize-md preto">{{ notice.message }}</p>
        <button type="button" class="icon-btn" aria-label="Fechar aviso" v-on:click="$emit('dismiss')">
            <font-awesome icon="times" aria-hidden="true" />
        </button>
    </div>
</template>

<script>
// Aviso inline (sucesso/atenção/erro). O texto é sempre interpolado, nunca HTML.
export default {
    props: { notice: { type: Object, default: null } },
    emits: ["dismiss"],
    computed: {
        // info (padrão azul) | warning (amarelo, padrão do aviso) | error (vermelho)
        noticeClass() { return this.notice.kind === "error" ? "danger" : this.notice.kind === "info" || this.notice.kind === "success" ? "info" : ""; }
    }
}
</script>
