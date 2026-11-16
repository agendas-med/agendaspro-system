<template>
    <div class="safe-text">
        <template v-for="(block, bi) in blocks" :key="bi">
            <p v-if="block.type === 'p'">
                <AssistantSafeInline :nodes="block.inline" />
            </p>
            <ul v-else>
                <li v-for="(item, ii) in block.items" :key="ii">
                    <AssistantSafeInline :nodes="item" />
                </li>
            </ul>
        </template>
    </div>
</template>

<script>
import { parseSafeText } from '../../utils/safeText.js';
import { linkOptions } from '../../utils/assistant.js';

// Texto da IA: nunca vira HTML. A árvore vem de parseSafeText (parágrafos, listas, negrito, links permitidos)
// e é desenhada só com interpolação ({{ }}); o link passa por safeHref (https dos domínios próprios ou caminho interno).
export default {
    props: {
        text: { type: String, default: "" }
    },
    computed: {
        blocks() {
            return parseSafeText(this.text, linkOptions());
        }
    }
}
</script>

<style scoped>
.safe-text {
    overflow-wrap: anywhere;
}

.safe-text p + p,
.safe-text p + ul,
.safe-text ul + p {
    margin-top: var(--space-3);
}

.safe-text ul {
    list-style: disc;
    padding-left: var(--space-8);
}
</style>
