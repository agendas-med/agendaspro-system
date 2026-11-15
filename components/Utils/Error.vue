<template>
    <p class="fontsize-md text-center error-text" :class="typeClass" v-if="text != ''"
        :role="type == 'error' ? 'alert' : 'status'">{{ text }}</p>
</template>
<script>
import { toDisplayText } from '../../utils/errors.js';

export default {
    emits: ["eraseError"],
    props: ["msg", "type"],
    computed: {
        // Sempre texto (nunca HTML): objetos de erro são convertidos em mensagem legível.
        text: function () {
            return toDisplayText(this.msg);
        },
        typeClass: function () {
            let typeClass = "verde-escuro";

            if (this.type == "error") {
                typeClass = "vermelho";
            }

            return typeClass;
        }
    },
    data() {
        return { timer: null };
    },
    watch: {
        // O aviso some sozinho 8 s depois de aparecer (a cada nova mensagem reinicia a contagem).
        text: {
            immediate: true,
            handler(value) {
                clearTimeout(this.timer);
                if (value === "") return;
                this.timer = setTimeout(() => {
                    this.$emit("eraseError");
                }, 8000);
            }
        }
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    }
}
</script>
<style scoped>
.error-text {
    white-space: pre-line;
}
</style>
