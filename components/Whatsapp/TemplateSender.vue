<template>
    <div class="tpl-sender" role="group" aria-labelledby="tpl-title">
        <h3 class="fontsize-lg-bold preto" id="tpl-title">Enviar um modelo aprovado</h3>

        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="tpl-error" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-primary" v-on:click="$emit('retry')">Tentar novamente</button>
        </div>

        <p class="fontsize-md cinza" v-else-if="!loading && !options.length" role="status">
            Nenhum modelo aprovado está disponível agora. Tente novamente mais tarde.
        </p>

        <form v-if="!loading && !loadError && options.length" novalidate v-on:submit.prevent="submit()">
            <div class="input-group">
                <label for="tpl-select">Modelo</label>
                <select id="tpl-select" v-model="selectedName" v-on:change="onTemplateChange()" :disabled="sending">
                    <option v-for="t in options" :key="t.name" :value="t.name">{{ t.label }}</option>
                </select>
            </div>

            <div class="input-group" v-for="(_, index) in params" :key="selectedName + '-' + index">
                <label :for="'tpl-param-' + index">Parâmetro {{ index + 1 }} ({{ placeholder(index) }})</label>
                <input :id="'tpl-param-' + index" type="text" v-model="params[index]" maxlength="1000" :disabled="sending" />
            </div>

            <div class="tpl-preview" v-if="template" aria-live="polite">
                <p class="fontsize-sm cinza">Prévia do que o cliente receberá</p>
                <p class="tpl-preview-text">{{ preview }}</p>
            </div>

            <p class="fontsize-sm vermelho" role="alert" v-if="localError">{{ localError }}</p>

            <button type="submit" class="btn btn-primary" :class="{ 'btn-loading': sending }" :disabled="sending || !template">
                <font-awesome icon="paper-plane" aria-hidden="true" /> Enviar modelo
            </button>
        </form>
    </div>
</template>

<script>
import { buildTemplatePayload, renderTemplatePreview, suggestTemplateParams, templatePurposeLabel } from '../../utils/whatsapp.js';

export default {
    props: {
        templates: { type: Array, default: () => [] },
        contactName: { type: String, default: "" },
        companyName: { type: String, default: "" },
        loading: { type: Boolean, default: false },
        loadError: { type: String, default: "" },
        sending: { type: Boolean, default: false }
    },
    emits: ["send", "retry"],
    data() {
        return { selectedName: "", params: [], localError: "" };
    },
    computed: {
        options() {
            return this.templates.map((t) => ({ name: t.name, label: templatePurposeLabel(t.purpose) + " (" + t.name + ")" }));
        },
        template() {
            return this.templates.find((t) => t.name === this.selectedName) || null;
        },
        preview() {
            return renderTemplatePreview(this.template, this.params);
        }
    },
    watch: {
        templates: {
            immediate: true,
            handler() {
                if (!this.template && this.templates.length) {
                    this.selectedName = this.templates[0].name;
                    this.onTemplateChange();
                }
            }
        },
        contactName() {
            this.fillSuggestions();
        }
    },
    methods: {
        placeholder(index) {
            return "{{" + (index + 1) + "}}";
        },
        fillSuggestions() {
            this.params = suggestTemplateParams(this.template, { contactName: this.contactName, companyName: this.companyName });
        },
        onTemplateChange() {
            this.localError = "";
            this.fillSuggestions();
        },
        submit() {
            const result = buildTemplatePayload(this.template, this.params);
            if (!result.ok) {
                this.localError = result.error;
                return;
            }
            this.localError = "";
            this.$emit("send", result.payload);
        }
    }
}
</script>

<style scoped>
.tpl-sender {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--amarelo);
    background: var(--amarelo-claro);
    border-radius: var(--radius-md);
}

.tpl-sender form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.tpl-preview {
    padding: var(--space-4);
    background: var(--branco);
    border-radius: var(--radius-md);
}

.tpl-preview-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.tpl-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
}

.tpl-sender .btn {
    width: auto;
    max-width: none;
    align-self: flex-start;
}

.vermelho {
    color: var(--vermelho);
}
</style>
