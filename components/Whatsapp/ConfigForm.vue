<template>
    <section class="ui-card" aria-labelledby="wa-config-title">
        <h2 class="fontsize-md-bold preto" id="wa-config-title">Atendimento automático</h2>

        <p class="fontsize-sm cinza" v-if="!isAdmin" role="status">
            Apenas administradores podem alterar estas configurações. Peça ao administrador da empresa.
        </p>

        <form novalidate v-on:submit.prevent="save()">
            <fieldset :disabled="!isAdmin || saving" class="wa-fieldset">
                <legend class="sr-only">Configurações do atendimento automático</legend>

                <div class="wa-check">
                    <input id="wa-bot" type="checkbox" v-model="form.bot_enabled" />
                    <label for="wa-bot">
                        <strong>Bot de atendimento ligado</strong>
                        <span class="fontsize-sm cinza">Responde menus, horários e agendamentos automaticamente. Desligado, toda conversa espera um atendente.</span>
                    </label>
                </div>

                <div class="wa-check">
                    <input id="wa-ai" type="checkbox" v-model="form.ai_enabled" />
                    <label for="wa-ai">
                        <strong>Respostas com IA</strong>
                        <span class="fontsize-sm cinza">Usa inteligência artificial para entender perguntas livres do cliente.</span>
                    </label>
                </div>

                <div class="input-group">
                    <label for="wa-welcome">Mensagem de boas-vindas (opcional)</label>
                    <textarea id="wa-welcome" v-model="form.welcome_text" rows="3" maxlength="300"
                        :aria-invalid="errors.welcome_text ? 'true' : 'false'"
                        :aria-describedby="errors.welcome_text ? 'wa-welcome-error' : 'wa-welcome-hint'"
                        placeholder="Ex.: Olá! Sou o assistente da clínica. Como posso ajudar?"></textarea>
                    <p class="fontsize-sm cinza" id="wa-welcome-hint">{{ (form.welcome_text || "").length }}/300 caracteres. Em branco, usa o texto padrão.</p>
                    <p class="fontsize-sm vermelho" id="wa-welcome-error" role="alert" v-if="errors.welcome_text">{{ errors.welcome_text }}</p>
                </div>

                <div class="input-group" v-if="form.ai_enabled">
                    <label for="wa-tokens">Limite diário de tokens da IA (opcional)</label>
                    <input id="wa-tokens" type="text" inputmode="numeric" v-model="form.ai_daily_token_limit"
                        :aria-invalid="errors.ai_daily_token_limit ? 'true' : 'false'"
                        :aria-describedby="errors.ai_daily_token_limit ? 'wa-tokens-error' : 'wa-tokens-hint'"
                        placeholder="Usar o limite do plano" />
                    <p class="fontsize-sm cinza" id="wa-tokens-hint">
                        Consumo hoje: {{ tokensToday }} tokens. Em branco, vale o limite do seu plano.
                    </p>
                    <p class="fontsize-sm vermelho" id="wa-tokens-error" role="alert" v-if="errors.ai_daily_token_limit">{{ errors.ai_daily_token_limit }}</p>
                </div>
            </fieldset>

            <div class="wa-actions" v-if="isAdmin">
                <button type="submit" class="btn btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving || !dirty">
                    Salvar configurações
                </button>
            </div>
        </form>
    </section>
</template>

<script>
import { configFormFromStatus, validateConfigForm } from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

export default {
    props: {
        status: { type: Object, required: true },
        isAdmin: { type: Boolean, default: false }
    },
    emits: ["saved"],
    data() {
        return {
            form: configFormFromStatus(this.status),
            errors: {},
            saving: false
        };
    },
    computed: {
        tokensToday() {
            return Number(this.status.aiTokensToday || 0).toLocaleString("pt-BR");
        },
        dirty() {
            const base = configFormFromStatus(this.status);
            return JSON.stringify(base) !== JSON.stringify(this.form);
        }
    },
    watch: {
        status(next) {
            this.form = configFormFromStatus(next);
            this.errors = {};
        }
    },
    methods: {
        async save() {
            if (!this.isAdmin) return;
            const result = validateConfigForm(this.form);
            this.errors = result.errors || {};
            if (!result.ok) return;
            this.saving = true;
            try {
                const response = await this.$base.api.put("/whatsapp/config", result.payload);
                this.$emit("saved", unwrap(response));
                this.$myFunctions.showToast(this, "Configurações do WhatsApp salvas.", "success");
            } catch (error) {
                this.$myFunctions.notifyError(this, error, "Não foi possível salvar as configurações.");
            } finally {
                this.saving = false;
            }
        }
    }
}
</script>

<style scoped>
.wa-fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
}

.wa-check {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
}

.wa-check input {
    margin-top: var(--space-2);
    width: 18px;
    height: 18px;
    flex: none;
}

.wa-check label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    cursor: pointer;
}

.wa-actions {
    margin-top: var(--space-6);
}

.wa-actions .btn {
    width: auto;
    max-width: none;
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
</style>
