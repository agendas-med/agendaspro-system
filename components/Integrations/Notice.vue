<template>
    <div class="int-notice" :class="notice.kind" :role="notice.kind === 'error' ? 'alert' : 'status'" v-if="notice">
        <p class="fontsize-md preto">{{ notice.message }}</p>
        <button type="button" class="rounded-button" aria-label="Fechar aviso" v-on:click="$emit('dismiss')">
            <font-awesome icon="times" aria-hidden="true" />
        </button>
    </div>
</template>

<script>
// Aviso inline (sucesso/atenção/erro). O texto é sempre interpolado, nunca HTML.
export default {
    props: { notice: { type: Object, default: null } },
    emits: ["dismiss"]
}
</script>
