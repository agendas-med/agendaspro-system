<template>
    <section class="wa-card" aria-labelledby="wa-templates-title" :aria-busy="loading ? 'true' : 'false'">
        <h2 class="fontsize-md-bold preto" id="wa-templates-title">Modelos de mensagem</h2>
        <p class="fontsize-sm cinza">
            Modelos são mensagens pré-aprovadas pela Meta. Servem para falar com o cliente fora da janela de 24 horas.
            A lista é gerenciada pela plataforma e é somente leitura.
        </p>

        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="wa-error" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-primary" v-on:click="load()">Tentar novamente</button>
        </div>

        <p class="fontsize-md cinza" v-if="!loading && !loadError && !templates.length" role="status">
            Nenhum modelo cadastrado ainda.
        </p>

        <div class="table-wrapper" v-if="!loading && !loadError && templates.length">
            <table class="matrix">
                <caption class="sr-only">Modelos de mensagem do WhatsApp e situação de aprovação</caption>
                <thead>
                    <tr>
                        <th scope="col">Modelo</th>
                        <th scope="col">Uso</th>
                        <th scope="col">Texto</th>
                        <th scope="col">Situação</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="t in templates" :key="t.name">
                        <th scope="row" data-th="Modelo"><code>{{ t.name }}</code></th>
                        <td data-th="Uso">{{ purpose(t.purpose) }}</td>
                        <td data-th="Texto" class="preview">{{ t.bodyPreview || "—" }}</td>
                        <td data-th="Situação"><span class="tag" :class="statusOf(t.status).tone">{{ statusOf(t.status).label }}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<script>
import { normalizeTemplates, templateStatus, templatePurposeLabel } from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

export default {
    data() {
        return { loading: true, loadError: "", templates: [] };
    },
    mounted() {
        this.load();
    },
    methods: {
        statusOf(status) {
            return templateStatus(status);
        },
        purpose(value) {
            return templatePurposeLabel(value);
        },
        async load() {
            this.loading = true;
            this.loadError = "";
            try {
                this.templates = normalizeTemplates(unwrap(await this.$base.api.get("/whatsapp/templates")));
            } catch (error) {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os modelos.");
            } finally {
                this.loading = false;
            }
        }
    }
}
</script>

<style scoped>
.wa-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
}

.wa-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
}

.wa-error .btn {
    width: auto;
}

.table-wrapper {
    overflow-x: auto;
}

.matrix {
    width: 100%;
    border-collapse: collapse;
}

.matrix th,
.matrix td {
    text-align: left;
    padding: var(--space-4);
    border-bottom: 1px solid var(--cinza-medio);
    vertical-align: top;
}

.matrix thead th {
    background: var(--cinza-claro);
}

.preview {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-width: 420px;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

@media (max-width: 640px) {
    .matrix thead {
        display: none;
    }

    .matrix tr {
        display: block;
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--cinza-medio);
    }

    .matrix th,
    .matrix td {
        display: block;
        border: 0;
        padding: var(--space-2) var(--space-4);
    }

    .matrix td::before,
    .matrix th[data-th]::before {
        content: attr(data-th) ": ";
        font-weight: 600;
    }
}
</style>
