<template>
    <section class="kb" :aria-busy="loading ? 'true' : 'false'">
        <div class="kb-lgpd" role="note">
            <p class="fontsize-md"><font-awesome icon="shield-halved" aria-hidden="true" /> <strong>Privacidade (LGPD)</strong></p>
            <p class="fontsize-sm">
                Os textos desta base são enviados ao provedor de IA do AgendasPro para gerar respostas. Não cadastre dados pessoais de clientes
                (CPF, telefone, e-mail, saúde), senhas ou informações confidenciais: use apenas regras, políticas e perguntas frequentes do negócio.
            </p>
        </div>

        <div class="kb-head">
            <p class="fontsize-sm cinza">
                {{ items.length }} de {{ maxItems }} textos ({{ activeCount }} {{ activeCount === 1 ? 'ativo' : 'ativos' }}).
                Só os textos ativos são usados nas respostas: desative um texto para pausá-lo sem apagar.
            </p>
            <button type="button" class="btn btn-primary kb-add" v-if="!editing && !loadError" :disabled="loading || atLimit" v-on:click="startAdd()">
                <font-awesome icon="plus" aria-hidden="true" /> Adicionar texto
            </button>
        </div>
        <p class="fontsize-sm vermelho" v-if="atLimit && !editing">A base chegou ao limite de {{ maxItems }} textos. Remova algum para adicionar outro.</p>

        <form class="kb-form" v-if="editing" novalidate v-on:submit.prevent="save()">
            <h3 class="fontsize-md"><strong>{{ form.id == null ? 'Novo texto' : 'Editar texto' }}</strong></h3>

            <div class="input-group">
                <label for="kb-kind">Tipo</label>
                <select id="kb-kind" v-model="form.kind" :disabled="saving">
                    <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
                <span class="inline-error" v-if="errors.kind">{{ errors.kind }}</span>
            </div>

            <div class="input-group">
                <label for="kb-title">Título</label>
                <input id="kb-title" type="text" v-model="form.title" :maxlength="maxTitle" :disabled="saving" autocomplete="off" />
                <span class="inline-error" v-if="errors.title">{{ errors.title }}</span>
            </div>

            <div class="input-group">
                <label for="kb-content">Conteúdo</label>
                <textarea id="kb-content" v-model="form.content" rows="7" :maxlength="maxContent" :disabled="saving"></textarea>
                <span class="fontsize-sm cinza">{{ form.content.length }}/{{ maxContent }} caracteres</span>
                <span class="inline-error" v-if="errors.content">{{ errors.content }}</span>
            </div>

            <div class="input-group kb-active">
                <label for="kb-active">
                    <input id="kb-active" type="checkbox" v-model="form.active" :disabled="saving" />
                    Usar este texto nas respostas (ativo)
                </label>
                <span class="inline-error" v-if="errors.active">{{ errors.active }}</span>
            </div>

            <p class="inline-error" role="alert" v-if="formError">{{ formError }}</p>

            <div class="kb-form-buttons">
                <button type="submit" class="btn btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving">Salvar</button>
                <button type="button" class="btn btn-cinza" :disabled="saving" v-on:click="cancel()">Cancelar</button>
            </div>
        </form>

        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="kb-state" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-primary" v-on:click="load()">Tentar novamente</button>
        </div>

        <p class="kb-state fontsize-md cinza" v-else-if="!loading && !items.length && !editing" role="status">
            Nenhum texto cadastrado. Adicione perguntas frequentes, políticas e regras para o assistente usar nas respostas.
        </p>

        <ul class="kb-items" v-if="!loading && !loadError && items.length" aria-label="Textos da base de conhecimento">
            <li class="kb-item" v-for="item in items" :key="item.id">
                <div class="kb-item-main">
                    <p class="kb-item-title"><strong>{{ item.title }}</strong></p>
                    <span class="tag fontsize-sm">{{ kindLabel(item.kind) }}</span>
                    <span class="tag fontsize-sm yellow" v-if="item.active === false">Inativo</span>
                    <p class="fontsize-sm cinza kb-item-excerpt">{{ excerpt(item.content) }}</p>
                </div>
                <div class="kb-item-buttons">
                    <button type="button" class="btn btn-cinza" :class="{ 'btn-loading': togglingId === item.id }"
                        :aria-pressed="item.active === false ? 'false' : 'true'"
                        :disabled="saving || removingId !== null || togglingId !== null" v-on:click="toggle(item)">
                        {{ item.active === false ? 'Ativar' : 'Desativar' }}
                    </button>
                    <button type="button" class="btn btn-cinza" :disabled="saving || removingId === item.id || togglingId === item.id" v-on:click="startEdit(item)">
                        <font-awesome icon="pen" aria-hidden="true" /> Editar
                    </button>
                    <button type="button" class="btn btn-cinza" :class="{ 'btn-loading': removingId === item.id }"
                        :disabled="saving || removingId !== null" v-on:click="remove(item)">
                        <font-awesome icon="trash-can" aria-hidden="true" /> Remover
                    </button>
                </div>
            </li>
        </ul>
    </section>
</template>

<script>
import {
    KNOWLEDGE_KINDS, KNOWLEDGE_MAX_ITEMS, MAX_KNOWLEDGE_TITLE, MAX_KNOWLEDGE_CONTENT, knowledgeKindLabel,
    normalizeKnowledgeList, emptyKnowledgeForm, knowledgeFormFromItem, knowledgePatch, validateKnowledgeForm, classifyKnowledgeError
} from '../../utils/assistant.js';
import { unwrap } from '../../utils/payloads.js';

// Base de conhecimento (RAG). Só administradores (o core devolve 401 a quem não é admin, e um 401 derrubaria a sessão
// pelo interceptor de refresh): por isso a tela nem chama a rota sem a permissão.
// Cada texto tem `active` (follow-up 1, A3): só os ativos entram nas respostas. Ativar/desativar e editar usam PATCH
// parcial (só os campos que mudaram); a criação é POST com o corpo completo. Erros do core vêm com código (A5).
export default {
    data() {
        return {
            items: [],
            loading: true,
            loadError: "",
            editing: false,
            form: emptyKnowledgeForm(),
            errors: {},
            formError: "",
            saving: false,
            removingId: null,
            togglingId: null,
            kinds: KNOWLEDGE_KINDS,
            maxItems: KNOWLEDGE_MAX_ITEMS,
            maxTitle: MAX_KNOWLEDGE_TITLE,
            maxContent: MAX_KNOWLEDGE_CONTENT
        };
    },
    computed: {
        isAdmin() { return this.$myFunctions.hasPermission(this); },
        atLimit() { return this.items.length >= KNOWLEDGE_MAX_ITEMS; },
        activeCount() { return this.items.filter((i) => i.active !== false).length; }
    },
    mounted() {
        if (!this.isAdmin) {
            this.loading = false;
            this.loadError = "Apenas administradores gerenciam a base de conhecimento.";
            return;
        }
        this.load();
    },
    methods: {
        kindLabel(kind) { return knowledgeKindLabel(kind); },
        excerpt(text) {
            const t = String(text || "").replace(/\s+/g, " ").trim();
            return t.length > 180 ? t.slice(0, 180) + "..." : t;
        },
        async load() {
            if (!this.isAdmin) return;
            this.loading = true;
            this.loadError = "";
            try {
                this.items = normalizeKnowledgeList(unwrap(await this.$base.api.get("/assistant/knowledge")));
            } catch (error) {
                const c = classifyKnowledgeError(error);
                if (c.kind === "disabled") this.$assistant.probe(true);
                this.loadError = c.message || "Não foi possível carregar a base de conhecimento.";
            } finally {
                this.loading = false;
            }
        },
        startAdd() {
            this.form = emptyKnowledgeForm();
            this.errors = {};
            this.formError = "";
            this.editing = true;
        },
        startEdit(item) {
            this.form = knowledgeFormFromItem(item);
            this.errors = {};
            this.formError = "";
            this.editing = true;
        },
        cancel() {
            if (this.saving) return;
            this.editing = false;
            this.errors = {};
            this.formError = "";
        },
        async save() {
            if (this.saving) return;
            const v = validateKnowledgeForm(this.form);
            this.errors = v.errors;
            this.formError = "";
            if (!v.ok) return;
            let patch = null;
            if (this.form.id != null) {
                // Edição: só o que mudou. Sem mudança nenhuma não há o que enviar.
                const current = this.items.find((i) => i.id === this.form.id);
                patch = knowledgePatch(current, v.payload);
                if (!Object.keys(patch).length) {
                    this.editing = false;
                    return;
                }
            }
            this.saving = true;
            try {
                if (this.form.id == null) await this.$base.api.post("/assistant/knowledge", v.payload);
                else await this.$base.api.patch("/assistant/knowledge/" + encodeURIComponent(this.form.id), patch);
                this.editing = false;
                this.$myFunctions.showToast(this, "Texto salvo.", "success");
                await this.load();
            } catch (error) {
                const c = classifyKnowledgeError(error);
                if (c.kind === "not_found") {
                    this.editing = false;
                    this.$myFunctions.showToast(this, c.message, "warning");
                    await this.load();
                } else if (c.kind === "validation" && c.hasFieldErrors) {
                    // Erros por campo do core (validation_error): marcados no campo, texto puro.
                    this.errors = { ...c.fields };
                    this.formError = "";
                } else if (!(c.kind === "upgrade" && c.handledGlobally)) {
                    // 409 knowledge_limit_reached, 403 admin_required e demais: a mensagem do core/utilitário.
                    this.formError = c.message || "Não foi possível salvar o texto.";
                }
            } finally {
                this.saving = false;
            }
        },
        // Ativar/desativar: PATCH só com { active }, a pedido do clique (nunca automático).
        async toggle(item) {
            if (this.togglingId !== null || this.removingId !== null || this.saving) return;
            const next = item.active === false;
            this.togglingId = item.id;
            try {
                await this.$base.api.patch("/assistant/knowledge/" + encodeURIComponent(item.id), { active: next });
                const target = this.items.find((i) => i.id === item.id);
                if (target) target.active = next;
                this.$myFunctions.showToast(this, next ? "Texto ativado." : "Texto desativado.", "success");
            } catch (error) {
                const c = classifyKnowledgeError(error);
                if (c.kind === "not_found") {
                    this.$myFunctions.showToast(this, c.message, "warning");
                    await this.load();
                } else if (!(c.kind === "upgrade" && c.handledGlobally)) {
                    this.$myFunctions.showToast(this, c.message || "Não foi possível alterar o texto.", "error");
                }
            } finally {
                this.togglingId = null;
            }
        },
        async remove(item) {
            if (this.removingId !== null) return;
            const ok = await this.$myFunctions.confirmDialog({
                title: "Remover texto",
                message: "O assistente deixa de usar \"" + item.title + "\" nas respostas. Esta ação não pode ser desfeita.",
                confirmLabel: "Remover",
                danger: true
            });
            if (!ok) return;
            this.removingId = item.id;
            try {
                await this.$base.api.delete("/assistant/knowledge/" + encodeURIComponent(item.id));
                this.items = this.items.filter((i) => i.id !== item.id);
                if (this.editing && this.form.id === item.id) this.editing = false;
                this.$myFunctions.showToast(this, "Texto removido.", "success");
            } catch (error) {
                const c = classifyKnowledgeError(error);
                if (c.kind === "not_found") {
                    this.items = this.items.filter((i) => i.id !== item.id);
                } else {
                    this.$myFunctions.showToast(this, c.message || "Não foi possível remover o texto.", "error");
                }
            } finally {
                this.removingId = null;
            }
        }
    }
}
</script>

<style scoped>
.kb {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.kb-lgpd {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5);
    border: 1px solid var(--amarelo);
    border-radius: var(--radius-md);
    background: var(--amarelo-claro);
}

.kb-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
}

.kb-add,
.kb-form-buttons .btn,
.kb-item-buttons .btn {
    width: auto;
    max-width: none;
}

.kb-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
}

.kb-form textarea {
    resize: vertical;
}

.kb-form-buttons,
.kb-item-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.kb-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-5);
}

.kb-state .btn {
    width: auto;
}

.kb-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.kb-item {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    background: var(--branco);
}

.kb-item-main {
    flex: 1 1 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.kb-item-title,
.kb-item-excerpt {
    overflow-wrap: anywhere;
}

.vermelho {
    color: var(--vermelho);
}
</style>
