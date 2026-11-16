<template>
    <section class="int-card" aria-labelledby="gc-links-title">
        <header class="int-card-header">
            <h2 class="fontsize-lg-bold preto" id="gc-links-title">Calendários vinculados</h2>
            <button type="button" class="btn btn-primary btn-auto" v-if="canEdit && !formOpen" v-on:click="openForm()">
                <font-awesome icon="plus" aria-hidden="true" /> Novo vínculo
            </button>
        </header>

        <p class="fontsize-md cinza">
            <strong class="preto">Exportar</strong> envia os agendamentos para um calendário do Google.
            <strong class="preto">Importar</strong> lê os horários ocupados de um calendário e bloqueia esses horários na agenda do profissional.
        </p>

        <p class="fontsize-md cinza" v-if="!links.length">
            Nenhum calendário vinculado ainda.<span v-if="canEdit"> Use "Novo vínculo" para escolher o que será sincronizado.</span>
        </p>

        <template v-for="group in groups" :key="group.role">
            <template v-if="group.items.length">
                <h3 class="fontsize-md-bold preto">{{ group.title }}</h3>
                <ul class="list">
                    <li v-for="link in group.items" :key="link.id" class="fontsize-md">
                        <div class="info">
                            <strong class="preto">{{ title(link) }}</strong>
                            <span class="fontsize-sm cinza block">{{ target(link) }}<template v-if="link.createdByApp"> · criado pelo AgendasPRO</template></span>
                            <span class="fontsize-sm cinza block" v-if="link.lastSyncAt">Última sincronização {{ since(link.lastSyncAt) }}</span>
                        </div>
                        <button type="button" class="btn btn-cinza btn-auto" v-if="canEdit" :disabled="!!state.removingLinkId"
                            :class="{ 'btn-loading': state.removingLinkId === link.id }" v-on:click="remove(link)">
                            Desvincular<span class="int-sr-only"> {{ title(link) }}</span>
                        </button>
                    </li>
                </ul>
            </template>
        </template>

        <form class="form" v-if="formOpen && canEdit" v-on:submit.prevent="submit()" novalidate>
            <h3 class="fontsize-md-bold preto">Novo vínculo</h3>
            <IntegrationsBlock id="gc-cal-block" title="Seus calendários do Google" :block="state.calendars.block" :empty="false"
                v-on:retry="$googleCalendar.loadCalendars()" locked-title="Vínculos no plano Premium"
                locked-text="Escolher calendários para sincronizar faz parte do plano Premium.">
                <fieldset class="field">
                    <legend class="fontsize-md-bold preto">O que sincronizar</legend>
                    <div class="int-check">
                        <input type="radio" id="gc-role-push" name="gc-role" value="push" v-model="form.role" />
                        <label for="gc-role-push">Exportar agendamentos para o Google</label>
                    </div>
                    <div class="int-check">
                        <input type="radio" id="gc-role-busy" name="gc-role" value="busy" v-model="form.role" />
                        <label for="gc-role-busy">Importar horários ocupados do Google</label>
                    </div>
                    <p class="inline-error" role="alert" v-if="errors.role">{{ errors.role }}</p>
                </fieldset>

                <fieldset class="field" v-if="form.role === 'push'">
                    <legend class="fontsize-md-bold preto">Destino da exportação</legend>
                    <div class="int-check">
                        <input type="radio" id="gc-src-app" name="gc-src" value="app" v-model="form.source" />
                        <label for="gc-src-app">Criar um calendário do AgendasPRO (recomendado)</label>
                    </div>
                    <div class="int-check">
                        <input type="radio" id="gc-src-existing" name="gc-src" value="existing" v-model="form.source" />
                        <label for="gc-src-existing">Usar um calendário que já existe</label>
                    </div>
                </fieldset>

                <div class="input-group" v-if="form.role === 'busy' || (form.role === 'push' && form.source === 'existing')">
                    <label for="gc-calendar">Calendário</label>
                    <select id="gc-calendar" v-model="form.calendarId" :aria-invalid="errors.calendarId ? 'true' : 'false'">
                        <option value="">Selecione…</option>
                        <option v-for="c in calendarOptions" :key="c.id" :value="c.id">
                            {{ c.summary }}{{ c.primary ? ' (principal)' : '' }}{{ form.role === 'push' && !c.writable ? ' (somente leitura)' : '' }}
                        </option>
                    </select>
                    <p class="inline-error" role="alert" v-if="errors.calendarId">{{ errors.calendarId }}</p>
                </div>

                <fieldset class="field" v-if="form.role === 'busy'">
                    <legend class="fontsize-md-bold preto">Quem terá a agenda bloqueada</legend>
                    <div class="int-check">
                        <input type="radio" id="gc-scope-pro" name="gc-scope" value="professional" v-model="form.scope" />
                        <label for="gc-scope-pro">Um profissional</label>
                    </div>
                    <div class="int-check">
                        <input type="radio" id="gc-scope-company" name="gc-scope" value="company" v-model="form.scope" />
                        <label for="gc-scope-company">Toda a empresa</label>
                    </div>
                </fieldset>

                <div class="input-group" v-if="form.role === 'push' || (form.role === 'busy' && form.scope === 'professional')">
                    <label for="gc-professional">
                        Profissional <span class="optional" v-if="form.role === 'push'">(opcional)</span>
                    </label>
                    <select id="gc-professional" v-model="form.professionalId" :aria-invalid="errors.professionalId ? 'true' : 'false'">
                        <option value="">{{ form.role === 'push' ? 'Todos os demais profissionais' : 'Selecione…' }}</option>
                        <option v-for="p in state.professionals" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
                    </select>
                    <p class="inline-error" role="alert" v-if="errors.professionalId">{{ errors.professionalId }}</p>
                </div>

                <p class="inline-error" role="alert" v-if="formError">{{ formError }}</p>
                <div class="int-actions">
                    <button type="submit" class="btn btn-primary" :disabled="state.savingLink" :class="{ 'btn-loading': state.savingLink }">Salvar vínculo</button>
                    <button type="button" class="btn btn-cinza" v-on:click="closeForm()">Cancelar</button>
                </div>
            </IntegrationsBlock>
        </form>
    </section>
</template>

<script>
import { groupLinks, linkTarget, linkTitle } from '../../utils/googleCalendar.js';
import { relativeTime } from '../../utils/integrations.js';

// Vínculos de calendário (exportar/importar). Todos veem a lista; só o administrador do plano Premium altera.
export default {
    data() {
        return { formOpen: false, form: this.blankForm(), errors: {}, formError: '' };
    },
    computed: {
        state() { return this.$googleCalendar.state; },
        links() { return this.state.links; },
        isAdmin() { return this.$myFunctions.hasPermission(this); },
        canEdit() { return this.isAdmin && this.state.premium !== false && this.$googleCalendar.view() === 'connected'; },
        groups() {
            const g = groupLinks(this.links);
            return [
                { role: 'push', title: 'Exportação (AgendasPRO para Google)', items: g.push },
                { role: 'busy', title: 'Importação (Google para AgendasPRO)', items: g.busy }
            ];
        },
        calendarOptions() { return this.state.calendars.items; }
    },
    watch: {
        'form.role'() { this.form.calendarId = ''; this.errors = {}; }
    },
    methods: {
        blankForm() {
            return { role: 'push', source: 'app', calendarId: '', professionalId: '', scope: 'professional' };
        },
        title: linkTitle,
        target(link) { return linkTarget(link, this.state.professionals); },
        since(iso) { return relativeTime(iso); },
        openForm() {
            this.form = this.blankForm();
            this.errors = {};
            this.formError = '';
            this.formOpen = true;
            this.$googleCalendar.loadCalendars();
        },
        closeForm() { this.formOpen = false; },
        async submit() {
            this.errors = {};
            this.formError = '';
            const result = await this.$googleCalendar.createLink(this.form);
            if (result.ok) {
                this.formOpen = false;
                return;
            }
            if (result.kind === 'validation') this.errors = result.errors || {};
            else if (!result.handledGlobally && result.kind !== 'stale' && result.kind !== 'busy') this.formError = result.message || 'Não foi possível salvar o vínculo.';
        },
        async remove(link) {
            const sure = await this.$myFunctions.confirmDialog({
                title: 'Desvincular este calendário?',
                message: link.role === 'busy'
                    ? 'Os horários importados deste calendário deixam de bloquear a agenda.'
                    : 'Os próximos agendamentos deixam de ser enviados a este calendário. Os eventos já exportados continuam no Google.',
                confirmLabel: 'Desvincular',
                danger: true
            });
            if (sure) await this.$googleCalendar.deleteLink(link.id);
        }
    }
}
</script>

<style scoped>
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--cinza-medio);
}

.info {
    min-width: 0;
    overflow-wrap: anywhere;
}

.block {
    display: block;
}

.form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 560px;
    padding-top: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.field {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}
</style>
