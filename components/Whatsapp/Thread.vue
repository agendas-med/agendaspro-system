<template>
    <section class="thread" aria-label="Conversa selecionada" :aria-busy="loading ? 'true' : 'false'">
        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="thread-state" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-primary" v-on:click="load()">Tentar novamente</button>
        </div>

        <template v-if="conv && !loading && !loadError">
            <!-- Cabeçalho -->
            <header class="thread-header">
                <button type="button" class="btn btn-cinza thread-back" v-on:click="$emit('back')" aria-label="Voltar para a lista de conversas">
                    <font-awesome icon="angle-left" aria-hidden="true" /> Voltar
                </button>
                <div class="thread-title">
                    <h2 class="fontsize-md-bold preto">{{ conv.name }}</h2>
                    <p class="fontsize-sm cinza" v-if="conv.hasName">{{ conv.phoneLabel }}</p>
                    <p class="fontsize-sm cinza">{{ assignment }}</p>
                </div>
                <span class="tag" :class="tag.tone">{{ tag.label }}</span>
                <div class="thread-actions">
                    <button type="button" class="btn btn-primary" :class="{ 'btn-loading': acting }"
                        :disabled="acting" v-if="!assumedByMe" v-on:click="assume()">
                        Assumir conversa
                    </button>
                    <button type="button" class="btn btn-cinza" :class="{ 'btn-loading': acting }"
                        :disabled="acting" v-if="conv.mode === 'human'" v-on:click="release()">
                        Devolver ao bot
                    </button>
                </div>
            </header>

            <!-- Mensagens -->
            <div class="thread-messages" ref="scroller" role="log" aria-live="polite" aria-relevant="additions"
                aria-label="Mensagens da conversa" tabindex="0">
                <button type="button" class="btn btn-cinza thread-older" v-if="hasOlder" :disabled="loadingOlder"
                    :class="{ 'btn-loading': loadingOlder }" v-on:click="loadOlder()">
                    Ver mensagens anteriores
                </button>
                <p class="fontsize-sm vermelho" role="alert" v-if="olderError">{{ olderError }}</p>
                <p class="thread-empty fontsize-md cinza" v-if="!messages.length">Nenhuma mensagem nesta conversa.</p>

                <ul class="msg-list">
                    <li v-for="m in messages" :key="m.id" class="msg" :class="[m.direction, 'author-' + m.author]">
                        <p class="msg-author fontsize-sm cinza">{{ authorLabel(m) }}</p>
                        <p class="msg-body">{{ text(m) }}</p>
                        <p class="msg-meta fontsize-sm cinza">
                            <span v-if="m.templateName">Modelo {{ m.templateName }} · </span>
                            <time>{{ time(m) }}</time>
                            <span v-if="m.direction === 'out' && statusLabel(m)"> · {{ statusLabel(m) }}</span>
                            <span v-if="m.status === 'failed' && m.errorCode" class="vermelho"> ({{ m.errorCode }})</span>
                        </p>
                    </li>
                </ul>
            </div>

            <!-- Aviso e envio -->
            <div class="thread-footer">
                <div class="thread-notice" :class="notice.kind" role="alert" v-if="notice">
                    <p>{{ notice.message }}</p>
                    <template v-if="notice.kind === 'upgrade'">
                        <NuxtLink to="/billing/plano" class="btn btn-primary" v-if="isAdmin">Ver planos e fazer upgrade</NuxtLink>
                        <p class="fontsize-sm" v-else>Peça ao administrador da empresa para mudar de plano.</p>
                    </template>
                </div>

                <div class="thread-notice optout" role="status" v-if="conv.optedOut">
                    <p>
                        <strong>Cliente fora da lista de envios (opt-out).</strong>
                        Ele pediu para não receber mensagens, então o envio está bloqueado para esta conversa.
                    </p>
                </div>

                <template v-else>
                    <WhatsappTemplateSender v-if="showTemplates" :templates="templateOptions"
                        :contact-name="conv.hasName ? conv.name : ''" :company-name="companyName"
                        :loading="templatesLoading" :load-error="templatesError" :sending="sending"
                        @send="sendTemplate" @retry="loadTemplates(true)" />

                    <form class="composer" v-else novalidate v-on:submit.prevent="sendText()">
                        <label for="wa-composer" class="sr-only">Escreva uma mensagem</label>
                        <textarea id="wa-composer" ref="composer" v-model="draft" rows="2" maxlength="4096"
                            placeholder="Escreva uma mensagem…" title="Enter envia; Shift+Enter quebra a linha"
                            :disabled="sending" v-on:keydown.enter.exact.prevent="sendText()"></textarea>
                        <button type="submit" class="btn btn-primary composer-send" :class="{ 'btn-loading': sending }"
                            :disabled="sending || !draft.trim()" aria-label="Enviar mensagem">
                            <font-awesome icon="paper-plane" aria-hidden="true" /> Enviar
                        </button>
                    </form>
                    <p class="fontsize-sm cinza" v-if="!conv.windowOpen && !showTemplates">
                        <button type="button" class="link-button" v-on:click="openTemplates()">Enviar um modelo aprovado</button>
                    </p>
                </template>
            </div>
        </template>
    </section>
</template>

<script>
import {
    AUTHOR_LABELS, MESSAGE_PAGE_SIZE, buildTextPayload, categoryTag, assignmentLabel, classifySendError,
    formatMessageTime, isConversationNotFound, isNearBottom, mergeMessages, messageStatusLabel, messageText,
    normalizeConversation, normalizeMessage, normalizeMessages, normalizeTemplates, oldestMessageId, selectableTemplates
} from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

// Conversa aberta: histórico, atualização leve (refresh() chamado pela página), assumir/devolver e envio.
// Todo texto vindo de clientes/mensagens é renderizado por interpolação (nunca como HTML).
export default {
    props: {
        conversationId: { type: Number, required: true },
        currentUserId: { type: [Number, String], default: null },
        companyName: { type: String, default: "" }
    },
    emits: ["back", "updated", "not-found"],
    data() {
        return {
            conv: null,
            messages: [],
            loading: true,
            loadError: "",
            hasOlder: false,
            loadingOlder: false,
            olderError: "",
            draft: "",
            sending: false,
            acting: false,
            notice: null,
            showTemplates: false,
            templates: [],
            templatesLoaded: false,
            templatesLoading: false,
            templatesError: "",
            token: 0
        };
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        },
        tag() {
            return categoryTag(this.conv.category);
        },
        assignment() {
            return assignmentLabel(this.conv, this.currentUserId);
        },
        assumedByMe() {
            return this.conv.mode === "human" && this.conv.assignedUserId === Number(this.currentUserId);
        },
        templateOptions() {
            return selectableTemplates(this.templates);
        }
    },
    watch: {
        conversationId: {
            immediate: true,
            handler() {
                this.reset();
                this.load();
            }
        }
    },
    methods: {
        authorLabel(m) {
            return AUTHOR_LABELS[m.author] || "";
        },
        text(m) {
            return messageText(m);
        },
        time(m) {
            return formatMessageTime(m.createdAt);
        },
        statusLabel(m) {
            return messageStatusLabel(m.status);
        },
        reset() {
            this.token += 1;
            this.conv = null;
            this.messages = [];
            this.loadError = "";
            this.hasOlder = false;
            this.olderError = "";
            this.draft = "";
            this.notice = null;
            this.showTemplates = false;
            this.sending = false;
            this.acting = false;
        },
        path(suffix = "") {
            return "/whatsapp/conversations/" + this.conversationId + suffix;
        },
        setConversation(conv) {
            this.conv = conv;
            this.$emit("updated", conv);
            if (!conv.windowOpen && !conv.optedOut) {
                this.showTemplates = true;
                this.loadTemplates();
            }
        },
        async load() {
            const token = this.token;
            this.loading = true;
            this.loadError = "";
            try {
                const [convRes, msgRes] = await Promise.all([
                    this.$base.api.get(this.path()),
                    this.$base.api.get(this.path("/messages"), { params: { limit: MESSAGE_PAGE_SIZE } })
                ]);
                if (token !== this.token) return;
                const list = unwrap(msgRes) || [];
                this.messages = normalizeMessages(list);
                this.hasOlder = list.length >= MESSAGE_PAGE_SIZE;
                this.setConversation(normalizeConversation(unwrap(convRes)));
                this.loading = false;
                this.$nextTick(() => this.scrollToBottom());
            } catch (error) {
                if (token !== this.token) return;
                this.loading = false;
                if (isConversationNotFound(error)) {
                    this.$emit("not-found");
                    return;
                }
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível abrir a conversa.");
            }
        },
        // Atualização silenciosa (polling): busca a última página e mescla por id.
        async refresh() {
            if (!this.conv || this.loading || this.sending) return;
            const token = this.token;
            try {
                const [convRes, msgRes] = await Promise.all([
                    this.$base.api.get(this.path()),
                    this.$base.api.get(this.path("/messages"), { params: { limit: MESSAGE_PAGE_SIZE } })
                ]);
                if (token !== this.token) return;
                const el = this.$refs.scroller;
                const stick = !el || isNearBottom(el);
                const before = this.messages.length;
                this.messages = mergeMessages(this.messages, normalizeMessages(unwrap(msgRes)));
                const fresh = normalizeConversation(unwrap(convRes));
                this.conv = fresh;
                this.$emit("updated", fresh);
                if (fresh.optedOut || fresh.windowOpen) this.showTemplates = false;
                if (stick && this.messages.length !== before) this.$nextTick(() => this.scrollToBottom());
            } catch (error) {
                if (token === this.token && isConversationNotFound(error)) this.$emit("not-found");
                // demais erros: silencioso (próxima rodada tenta de novo)
            }
        },
        async loadOlder() {
            const beforeId = oldestMessageId(this.messages);
            if (!beforeId || this.loadingOlder) return;
            const token = this.token;
            this.loadingOlder = true;
            this.olderError = "";
            try {
                const res = await this.$base.api.get(this.path("/messages"), { params: { before_id: beforeId, limit: MESSAGE_PAGE_SIZE } });
                if (token !== this.token) return;
                const list = unwrap(res) || [];
                const el = this.$refs.scroller;
                const previousHeight = el ? el.scrollHeight : 0;
                this.messages = mergeMessages(this.messages, normalizeMessages(list));
                this.hasOlder = list.length >= MESSAGE_PAGE_SIZE;
                this.$nextTick(() => {
                    if (el) el.scrollTop += el.scrollHeight - previousHeight;
                });
            } catch (error) {
                if (token === this.token) this.olderError = this.$myFunctions.errorMessage(error, "Não foi possível carregar as mensagens anteriores.");
            } finally {
                if (token === this.token) this.loadingOlder = false;
            }
        },
        scrollToBottom() {
            const el = this.$refs.scroller;
            if (el) el.scrollTop = el.scrollHeight;
        },
        async loadTemplates(force = false) {
            if (this.templatesLoaded && !force) return;
            this.templatesLoading = true;
            this.templatesError = "";
            try {
                this.templates = normalizeTemplates(unwrap(await this.$base.api.get("/whatsapp/templates")));
                this.templatesLoaded = true;
            } catch (error) {
                this.templatesError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os modelos.");
            } finally {
                this.templatesLoading = false;
            }
        },
        openTemplates() {
            this.showTemplates = true;
            this.loadTemplates();
        },
        async assume() {
            if (this.conv.mode === "human" && this.conv.assignedUserId && !this.assumedByMe) {
                const ok = await this.$myFunctions.confirmDialog({
                    title: "Assumir conversa",
                    message: "Esta conversa já está com outro atendente. Deseja assumi-la mesmo assim?",
                    confirmLabel: "Assumir"
                });
                if (!ok) return;
            }
            await this.act("/assume", "Você assumiu a conversa. O bot não responderá enquanto ela estiver com você.");
        },
        async release() {
            const ok = await this.$myFunctions.confirmDialog({
                title: "Devolver ao bot",
                message: "O bot volta a responder esta conversa a partir do menu inicial.",
                confirmLabel: "Devolver ao bot"
            });
            if (ok) await this.act("/release", "Conversa devolvida ao bot.");
        },
        async act(suffix, successMessage) {
            const token = this.token;
            this.acting = true;
            try {
                const res = await this.$base.api.post(this.path(suffix));
                if (token !== this.token) return;
                this.setConversation(normalizeConversation(unwrap(res)));
                this.$myFunctions.showToast(this, successMessage, "success");
            } catch (error) {
                if (token === this.token && isConversationNotFound(error)) this.$emit("not-found");
                else this.$myFunctions.notifyError(this, error, "Não foi possível alterar o atendimento.");
            } finally {
                if (token === this.token) this.acting = false;
            }
        },
        sendText() {
            if (this.sending || this.conv.optedOut) return;
            const result = buildTextPayload(this.draft);
            if (!result.ok) {
                this.notice = { kind: "validation", message: result.error };
                return;
            }
            return this.send(result.payload, "text");
        },
        sendTemplate(payload) {
            if (this.sending || this.conv.optedOut) return;
            return this.send(payload, "template");
        },
        async send(payload, mode) {
            const token = this.token;
            this.sending = true;
            this.notice = null;
            try {
                const res = await this.$base.api.post(this.path("/messages"), payload);
                if (token !== this.token) return;
                const sent = normalizeMessage(unwrap(res));
                if (sent.id != null) this.messages = mergeMessages(this.messages, [sent]);
                if (mode === "text") this.draft = "";
                this.$nextTick(() => this.scrollToBottom());
                this.sending = false;
                await this.refresh();
            } catch (error) {
                if (token !== this.token) return;
                this.handleSendError(error);
            } finally {
                if (token === this.token) this.sending = false;
            }
        },
        handleSendError(error) {
            const failure = classifySendError(error);
            switch (failure.kind) {
                case "window_closed":
                    this.conv = { ...this.conv, windowOpen: false };
                    this.notice = { kind: "warning", message: failure.message };
                    this.openTemplates();
                    break;
                case "opted_out":
                    this.conv = { ...this.conv, optedOut: true, category: "optout" };
                    this.showTemplates = false;
                    this.notice = { kind: "error", message: failure.message };
                    this.$emit("updated", this.conv);
                    break;
                case "template_unavailable":
                    this.notice = { kind: "warning", message: failure.message };
                    this.loadTemplates(true);
                    break;
                case "template_params":
                case "validation":
                case "not_configured":
                    this.notice = { kind: "warning", message: failure.message };
                    break;
                case "send_failed":
                    this.notice = { kind: "error", message: failure.message + (failure.retryable ? "" : " Se o problema continuar, entre em contato com o suporte.") };
                    break;
                case "upgrade":
                    // O interceptor global já abriu o convite; aqui fica o aviso permanente na conversa.
                    this.notice = { kind: "upgrade", message: failure.message };
                    break;
                case "not_found":
                    this.$emit("not-found");
                    break;
                default:
                    this.$myFunctions.notifyError(this, error, "Não foi possível enviar a mensagem.");
            }
        },
    }
}
</script>

<style scoped>
.thread {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
    overflow: hidden;
    min-height: 520px;
    max-height: calc(100vh - 220px);
}

.thread-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6);
}

.thread-state .btn {
    width: auto;
}

.thread-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    border-bottom: 1px solid var(--cinza-medio);
}

.thread-title {
    flex: 1 1 200px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.thread-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.thread-actions .btn,
.thread-back {
    width: auto;
    max-width: none;
}

.thread-back {
    display: none;
}

.thread-messages {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-5);
    background: var(--cinza-claro);
}

.thread-older {
    width: auto;
    max-width: none;
    margin: 0 auto var(--space-4);
}

.thread-empty {
    text-align: center;
    padding: var(--space-6);
}

.msg-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.msg {
    max-width: 78%;
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--branco);
    border: 1px solid var(--cinza-medio);
    align-self: flex-start;
}

.msg.out {
    align-self: flex-end;
    background: var(--azul-claro);
}

.msg.author-bot {
    background: var(--cinza-medio);
}

.msg-body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.thread-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.thread-notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-md);
    border: 1px solid var(--amarelo);
    background: var(--amarelo-claro);
}

.thread-notice.error,
.thread-notice.optout {
    border-color: var(--vermelho);
}

.thread-notice .btn {
    width: auto;
    max-width: none;
}

.composer {
    display: flex;
    gap: var(--space-4);
    align-items: flex-end;
}

.composer textarea {
    flex: 1 1 auto;
    min-width: 0;
    resize: vertical;
    min-height: 56px;
}

.composer-send {
    width: auto;
    max-width: none;
    flex: none;
}

.link-button {
    background: none;
    border: 0;
    padding: 0;
    color: var(--azul);
    text-decoration: underline;
    cursor: pointer;
}

.vermelho {
    color: var(--vermelho);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

@media (max-width: 900px) {
    .thread {
        max-height: none;
    }

    .thread-back {
        display: inline-flex;
    }

    .msg {
        max-width: 92%;
    }
}
</style>
