<template>
    <section class="chat" aria-label="Conversa com o assistente">
        <header class="chat-header">
            <h2 class="fontsize-md-bold chat-title">{{ title }}</h2>
            <AssistantUsageMeter class="chat-usage" :usage="state.usage" :plan="state.plan" />
        </header>

        <div class="chat-messages" ref="scroller" tabindex="0" aria-label="Mensagens" aria-live="polite" :aria-busy="state.loadingMessages ? 'true' : 'false'">
            <UtilsLoading :loading="state.loadingMessages" />

            <div class="chat-empty" v-if="!state.loadingMessages && !state.messages.length">
                <p class="fontsize-md"><strong>Como posso ajudar?</strong></p>
                <p class="fontsize-sm cinza">
                    Pergunte sobre sua agenda, serviços e regras da empresa. Quando uma ação mudar algum dado (como criar um agendamento),
                    eu mostro um resumo e só executo depois que você clicar em Confirmar.
                </p>
            </div>

            <ul class="msg-list" v-if="state.messages.length">
                <template v-for="m in state.messages" :key="m.key">
                    <li class="msg" :class="[m.role === 'user' ? 'out' : 'in', 'state-' + m.state]">
                        <p class="msg-meta fontsize-sm cinza">
                            <strong>{{ m.role === 'user' ? 'Você' : 'Assistente' }}</strong>
                            <span v-if="when(m)"> · {{ when(m) }}</span>
                        </p>
                        <AssistantSafeText v-if="m.role === 'assistant'" :text="m.content" />
                        <p class="msg-text" v-else>{{ m.content }}</p>

                        <p class="msg-flag fontsize-sm" v-if="m.state === 'unknown'">
                            Não sei se esta mensagem chegou ao servidor. Aguarde a verificação antes de enviar de novo.
                        </p>
                        <p class="msg-degraded fontsize-sm cinza" v-if="m.role === 'assistant' && degradedText(m)">
                            <font-awesome icon="triangle-exclamation" aria-hidden="true" /> {{ degradedText(m) }}
                        </p>

                        <p class="msg-sources fontsize-sm cinza" v-if="m.citations && m.citations.length">
                            <font-awesome icon="book-open" aria-hidden="true" /> Fontes consultadas: {{ citationSummary(m.citations) }}
                        </p>
                    </li>
                    <li class="msg-action" v-for="a in actionsFor(m.key)" :key="a.actionId">
                        <AssistantActionCard :action="a" @confirm="onConfirm" @reject="onReject" @verify="onVerify" @reissue="onReissue" />
                    </li>
                </template>

                <li class="msg-action" v-for="a in looseActions" :key="a.actionId">
                    <AssistantActionCard :action="a" @confirm="onConfirm" @reject="onReject" @verify="onVerify" @reissue="onReissue" />
                </li>
            </ul>

            <p class="chat-typing fontsize-sm cinza" v-if="state.sending" role="status">
                <font-awesome icon="circle-notch" spin aria-hidden="true" /> O assistente está respondendo... pode levar alguns segundos.
            </p>
            <p class="chat-typing fontsize-sm cinza" v-else-if="state.recovering" role="status">
                <font-awesome icon="circle-notch" spin aria-hidden="true" /> Conferindo se a resposta chegou...
            </p>
        </div>

        <div class="chat-footer">
            <div class="ui-notice" :class="noticeClass" role="alert" v-if="notice">
                <p v-if="notice.tag === 'rate_limited'">
                    <template v-if="cooldownSeconds > 0">Muitas mensagens em pouco tempo. Aguarde para enviar de novo<span aria-hidden="true"> em <strong>{{ cooldownSeconds }} s</strong></span>.</template>
                    <template v-else>Você já pode enviar de novo.</template>
                </p>
                <p v-else>{{ notice.message }}</p>
                <div class="chat-notice-actions">
                    <template v-if="notice.kind === 'upgrade'">
                        <NuxtLink to="/billing/plano" class="btn btn-primary" v-if="isAdmin">Ver planos e fazer upgrade</NuxtLink>
                        <p class="fontsize-sm" v-else>Peça ao administrador da empresa para mudar de plano.</p>
                    </template>
                    <button type="button" class="btn btn-cinza" v-if="notice.tag !== 'recovering'" v-on:click="$assistant.dismissNotice()">Dispensar</button>
                </div>
            </div>

            <form class="composer" novalidate v-on:submit.prevent="submit()">
                <label for="assistant-composer" class="sr-only">Escreva sua mensagem para o assistente</label>
                <textarea id="assistant-composer" ref="composer" v-model="state.draft" rows="2" :maxlength="maxLength"
                    placeholder="Pergunte algo ao assistente..." title="Enter envia, Shift+Enter quebra a linha"
                    :disabled="state.sending || state.recovering" v-on:keydown.enter.exact="onEnter($event)"></textarea>
                <button type="submit" class="btn btn-primary composer-send" :class="{ 'btn-loading': state.sending }"
                    :disabled="!canSend" aria-label="Enviar mensagem">
                    <font-awesome icon="paper-plane" aria-hidden="true" /> Enviar
                </button>
            </form>
            <p class="fontsize-sm cinza composer-hint">
                <span v-if="formError" class="vermelho" role="alert">{{ formError }}</span>
                <span v-else>{{ state.draft.length }}/{{ maxLength }} caracteres. Enter envia, Shift+Enter quebra a linha. Respostas de IA podem conter erros: confira antes de agir.</span>
            </p>
        </div>
    </section>
</template>

<script>
import { MAX_MESSAGE_LENGTH, conversationLabel, formatWhen, degradedNotice } from '../../utils/assistant.js';
import { cooldownLeft } from '../../utils/assistantController.js';

// Painel de conversa. A tela só dispara o controlador ($assistant); nenhuma escrita acontece sem clique do usuário.
// Todo texto vindo do core/IA passa por interpolação (usuário) ou por AssistantSafeText (IA) — nunca v-html.
export default {
    data() {
        return { now: Date.now(), timer: null, formError: "", maxLength: MAX_MESSAGE_LENGTH };
    },
    computed: {
        state() { return this.$assistant.state; },
        notice() { return this.state.notice; },
        isAdmin() { return this.$myFunctions.hasPermission(this); },
        noticeClass() {
            const kind = this.notice && this.notice.kind;
            return kind === 'error' ? 'danger' : kind === 'info' ? 'info' : '';
        },
        title() {
            const active = this.state.conversations.find((c) => c.id === this.state.activeId);
            return active ? conversationLabel(active) : "Nova conversa";
        },
        cooldownSeconds() {
            if (!this.notice || this.notice.tag !== "rate_limited") return 0;
            return cooldownLeft(this.state.cooldownUntil, this.now);
        },
        canSend() {
            const s = this.state;
            return !s.sending && !s.recovering && this.cooldownSeconds === 0 && s.status === "enabled" && !!s.draft.trim();
        },
        // Ações sem mensagem de âncora (restauradas do histórico): aparecem ao final.
        looseActions() {
            const keys = new Set(this.state.messages.map((m) => m.key));
            return this.state.actions.filter((a) => a.conversationId === this.state.activeId && (!a.anchor || !keys.has(a.anchor)));
        }
    },
    watch: {
        "state.messages.length"() { this.scrollDown(); },
        "state.actions.length"() { this.scrollDown(); },
        "state.sending"() { this.scrollDown(); }
    },
    mounted() {
        this.timer = setInterval(() => { this.now = Date.now(); }, 1000);
        this.scrollDown();
    },
    beforeUnmount() {
        if (this.timer) clearInterval(this.timer);
    },
    methods: {
        when(m) { return m.createdAt ? formatWhen(m.createdAt) : ""; },
        actionsFor(key) {
            return this.state.actions.filter((a) => a.anchor === key && a.conversationId === this.state.activeId);
        },
        // Aviso discreto só quando a resposta está degradada (A2); texto puro, nunca HTML.
        degradedText(m) {
            return degradedNotice(m.source, m.degraded);
        },
        citationSummary(list) {
            const counts = new Map();
            for (const c of list) counts.set(c.label, (counts.get(c.label) || 0) + 1);
            return [...counts.entries()].map(([label, n]) => (n > 1 ? label + " (" + n + ")" : label)).join(", ");
        },
        scrollDown() {
            this.$nextTick(() => {
                const el = this.$refs.scroller;
                if (el) el.scrollTop = el.scrollHeight;
            });
        },
        onEnter(event) {
            // Enter envia; durante composição de IME (acentos) não.
            if (event.isComposing) return;
            event.preventDefault();
            this.submit();
        },
        async submit() {
            this.formError = "";
            if (!this.canSend) return;
            const result = await this.$assistant.send(this.state.draft);
            if (!result.ok && result.reason === "invalid") this.formError = result.error || "Escreva uma mensagem.";
            if (!result.ok && result.reason === "duplicate") this.formError = "Mensagem repetida: aguarde um instante antes de reenviar.";
            if (!result.ok && result.reason === "disabled") this.formError = "O assistente não está disponível agora.";
            this.$nextTick(() => { if (this.$refs.composer) this.$refs.composer.focus(); });
        },
        onConfirm(id) { this.$assistant.confirm(id); },
        onReject(id) { this.$assistant.reject(id); },
        onVerify(id) { this.$assistant.verifyAction(id); },
        // Só gera um token novo (não confirma): depois o usuário ainda clica em Confirmar.
        onReissue(id) { this.$assistant.reissueToken(id); }
    }
}
</script>

<style scoped>
.chat {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-lg);
    overflow: hidden;
    min-height: 520px;
    max-height: calc(100vh - 220px);
}

.chat-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5);
    border-bottom: 1px solid var(--cinza-medio);
}

.chat-title {
    flex: 1 1 200px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.chat-usage {
    flex: 1 1 260px;
    max-width: 420px;
}

.chat-messages {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-5);
    background: var(--cinza-claro);
}

.chat-empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.msg.out {
    align-self: flex-end;
    background: var(--azul-claro);
}

.msg.state-sending {
    opacity: 0.7;
}

.msg-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.msg-flag {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--amarelo-claro);
}

.msg-degraded {
    margin-top: var(--space-1);
}

.msg-action {
    align-self: flex-start;
    max-width: 92%;
    width: 100%;
}

.chat-typing {
    margin-top: var(--space-4);
}

.chat-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.chat-notice-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
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

@media (max-width: 640px) {
    .composer {
        flex-direction: column;
        align-items: stretch;
    }

    .composer-send {
        width: 100%;
    }
}

@media (max-width: 900px) {
    .chat {
        max-height: none;
    }

    .msg {
        max-width: 92%;
    }
}
</style>
