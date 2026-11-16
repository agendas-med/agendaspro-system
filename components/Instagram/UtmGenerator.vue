<template>
    <IntegrationsBlock id="ig-utm" title="Links rastreáveis (UTM)" :block="state.blocks.links" :empty="false" v-on:retry="$instagram.loadDashboard()">
        <p class="fontsize-md cinza">
            Gere links da sua página de agendamento com a origem já marcada. Quando o cliente entra por eles e agenda,
            o AgendasPRO atribui a visita e o agendamento ao Instagram. O link da bio está disponível em todos os planos.
        </p>

        <form class="form" v-on:submit.prevent="submit()" novalidate>
            <fieldset class="placements">
                <legend class="fontsize-md-bold preto">Onde o link será usado</legend>
                <div class="int-check" v-for="p in placements" :key="p.value">
                    <input type="radio" name="ig-placement" :id="'ig-pl-' + p.value" :value="p.value" v-model="form.placement"
                        :disabled="p.premium && state.premium === false" />
                    <label :for="'ig-pl-' + p.value">
                        {{ p.label }}<span class="tag yellow" v-if="p.premium && state.premium === false"> Premium</span>
                        <span class="fontsize-sm cinza block">{{ p.hint }}</span>
                    </label>
                </div>
                <p class="inline-error" role="alert" v-if="errors.placement">{{ errors.placement }}</p>
            </fieldset>

            <div class="input-group" v-if="form.placement === 'campaign' || form.placement === 'post' || form.placement === 'story'">
                <label for="ig-utm-campaign">Campanha <span class="optional" v-if="form.placement !== 'campaign'">(opcional)</span></label>
                <input id="ig-utm-campaign" type="text" maxlength="80" v-model="form.campaign" autocomplete="off"
                    :aria-invalid="errors.campaign ? 'true' : 'false'" aria-describedby="ig-utm-campaign-err" />
                <p class="inline-error" id="ig-utm-campaign-err" role="alert" v-if="errors.campaign">{{ errors.campaign }}</p>
            </div>
            <div class="input-group" v-if="form.placement === 'post' || form.placement === 'story'">
                <label for="ig-utm-content">{{ form.placement === 'post' ? 'Identificação do post' : 'Identificação do story' }}</label>
                <input id="ig-utm-content" type="text" maxlength="80" v-model="form.content" autocomplete="off"
                    :aria-invalid="errors.content ? 'true' : 'false'" aria-describedby="ig-utm-content-err" />
                <p class="inline-error" id="ig-utm-content-err" role="alert" v-if="errors.content">{{ errors.content }}</p>
            </div>
            <div class="input-group">
                <label for="ig-utm-label">Nome para você se lembrar <span class="optional">(opcional)</span></label>
                <input id="ig-utm-label" type="text" maxlength="120" v-model="form.label" autocomplete="off" />
            </div>

            <p class="inline-error" role="alert" v-if="formError">{{ formError }}</p>
            <div class="int-actions">
                <button type="submit" class="btn btn-primary" :disabled="state.creatingLink || !form.placement"
                    :class="{ 'btn-loading': state.creatingLink }">Gerar link</button>
            </div>
        </form>

        <div class="result" v-if="state.lastLink && state.lastLink.url" aria-live="polite">
            <h3 class="fontsize-md-bold preto">Link gerado</h3>
            <div class="row">
                <input type="text" readonly :value="state.lastLink.url" aria-label="Link gerado" v-on:focus="$event.target.select()" />
                <button type="button" class="btn btn-primary btn-auto" v-on:click="copy(state.lastLink)">
                    <font-awesome icon="copy" aria-hidden="true" /> {{ copiedId === state.lastLink.id ? "Copiado!" : "Copiar link" }}
                </button>
            </div>
            <p class="fontsize-sm cinza" v-if="copyFailed" role="alert">Não foi possível copiar automaticamente. Selecione o link e copie manualmente.</p>
            <p class="fontsize-sm cinza" v-if="!state.lastLink.pageReady">
                A página pública de agendamento está desativada: ative-a para que este link receba clientes.
            </p>
            <WhatsappQrCode :text="state.lastLink.url" label="QR Code do link com UTM do Instagram" filename="qrcode-instagram.svg" />
        </div>

        <template v-if="state.utmLinks.length">
            <h3 class="fontsize-md-bold preto">Seus links</h3>
            <ul class="links">
                <li v-for="link in state.utmLinks" :key="link.id || link.url" class="fontsize-md">
                    <div>
                        <strong class="preto">{{ title(link) }}</strong>
                        <span class="fontsize-sm cinza block">{{ link.url }}</span>
                    </div>
                    <button type="button" class="btn btn-cinza btn-auto" v-on:click="copy(link)">
                        {{ copiedId === link.id ? "Copiado!" : "Copiar" }}<span class="int-sr-only"> link {{ title(link) }}</span>
                    </button>
                </li>
            </ul>
        </template>
    </IntegrationsBlock>
</template>

<script>
import { UTM_PLACEMENTS, utmLinkTitle } from '../../utils/instagram.js';
import { copyText } from '../../utils/clipboard.js';

// Gerador de links UTM. Bio vale para todos os planos; post/story/campanha pedem o Premium.
export default {
    data() {
        return {
            form: { placement: 'bio', campaign: '', content: '', label: '' },
            errors: {},
            formError: '',
            copiedId: null,
            copyFailed: false,
            timer: null
        };
    },
    computed: {
        state() { return this.$instagram.state; },
        placements() { return UTM_PLACEMENTS; }
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    },
    methods: {
        title: utmLinkTitle,
        async submit() {
            this.errors = {};
            this.formError = '';
            const result = await this.$instagram.createLink(this.form);
            if (result.ok) {
                this.form = { placement: this.form.placement, campaign: '', content: '', label: '' };
                return;
            }
            if (result.kind === 'validation' || result.kind === 'locked') this.errors = result.errors || {};
            else if (!result.handledGlobally && result.kind !== 'stale' && result.kind !== 'busy') this.formError = result.message || 'Não foi possível gerar o link.';
        },
        async copy(link) {
            const ok = await copyText(link.url);
            this.copyFailed = !ok;
            this.copiedId = ok ? link.id : null;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => { this.copiedId = null; }, 3000);
        }
    }
}
</script>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 560px;
}

.placements {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.block {
    display: block;
}

.result {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--verde);
    border-radius: var(--radius-md);
}

.row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
}

.row input {
    flex: 1 1 260px;
    min-width: 0;
}

.links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.links li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--cinza-medio);
}

.links li div {
    min-width: 0;
    overflow-wrap: anywhere;
}
</style>
