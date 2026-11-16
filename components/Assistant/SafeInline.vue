<template>
    <template v-for="(node, i) in nodes" :key="i">
        <br v-if="node.t === 'br'" />
        <strong v-else-if="node.t === 'strong'">{{ node.v }}</strong>
        <template v-else-if="node.t === 'link'">
            <NuxtLink v-if="isInternal(node.href)" :to="node.href" class="safe-link">{{ node.v }}</NuxtLink>
            <a v-else :href="node.href" class="safe-link" target="_blank" rel="noopener noreferrer nofollow">{{ node.v }}</a>
        </template>
        <template v-else>{{ node.v }}</template>
    </template>
</template>

<script>
export default {
    props: {
        nodes: { type: Array, default: () => [] }
    },
    methods: {
        // Só caminhos do próprio painel ("/algo") viram rota; o resto (https/mailto já filtrados) abre fora.
        isInternal(href) {
            return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
        }
    }
}
</script>

<style scoped>
.safe-link {
    color: var(--azul);
    text-decoration: underline;
}
</style>
