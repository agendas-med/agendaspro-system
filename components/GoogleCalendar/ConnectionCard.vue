<template>
    <section class="ui-card int-card" aria-labelledby="gc-conn-title">
        <header class="ui-card-header">
            <h2 class="fontsize-md-bold preto" id="gc-conn-title">
                <font-awesome :icon="['fab', 'google']" aria-hidden="true" /> Conta do Google
            </h2>
            <span class="tag" :class="tagClass" role="status">{{ label }}</span>
        </header>

        <p class="fontsize-md cinza" role="status" v-if="view === 'loading'">Verificando a conexão…</p>

        <template v-else-if="view === 'error'">
            <p class="fontsize-md preto" role="alert">{{ state.error ? state.error.message : "Não foi possível verificar a conexão." }}</p>
            <div class="int-actions">
                <button type="button" class="btn btn-cinza" v-on:click="$googleCalendar.load()">Tentar novamente</button>
            </div>
        </template>

        <p class="fontsize-md cinza" v-else-if="view === 'not_configured'">
            A integração com o Google Agenda ainda não está disponível nesta plataforma. Nenhuma ação é necessária da sua parte.
        </p>

        <template v-else-if="view === 'disconnected' || view === 'connecting'">
            <p class="fontsize-md cinza">
                Envie os agendamentos para o Google Agenda dos profissionais e leia os horários ocupados de lá para que ninguém
                seja agendado em cima de um compromisso pessoal. Você escolhe quais calendários participam.
            </p>
            <IntegrationsUpgradeCta v-if="state.premium === false" title="Google Agenda no plano Premium"
                text="A sincronização com o Google Agenda faz parte do plano Premium." />
            <template v-else>
                <div class="int-actions" v-if="isAdmin">
                    <button type="button" class="btn btn-primary" :class="{ 'btn-loading': view === 'connecting' }"
                        :disabled="view === 'connecting'" v-on:click="$googleCalendar.connect()">
                        {{ view === 'connecting' ? "Abrindo o Google…" : "Conectar Google Agenda" }}
                    </button>
                </div>
                <p class="fontsize-md cinza" v-else>Somente o administrador da empresa pode conectar o Google Agenda.</p>
            </template>
        </template>

        <template v-else>
            <p class="fontsize-md cinza">
                Conta conectada: <strong class="preto account">{{ state.account ? state.account.email : "" }}</strong>
            </p>
            <div class="ui-notice int-notice" role="alert" v-if="view === 'reauth_required'">
                <p class="fontsize-md preto">
                    O acesso ao Google foi revogado ou expirou. A sincronização está parada até você reconectar a conta.
                </p>
            </div>
            <p class="fontsize-md preto" role="alert" v-else-if="errorMessage">{{ errorMessage }}</p>
            <IntegrationsUpgradeCta v-if="state.premium === false" title="Sincronização pausada no plano gratuito"
                text="Seus vínculos foram mantidos, mas só o plano Premium sincroniza. Você pode desconectar o Google a qualquer momento." />
            <template v-else>
                <p class="fontsize-md cinza">{{ summary }}</p>
                <p class="fontsize-sm cinza">{{ latencyNote }}</p>
            </template>
            <p class="fontsize-sm preto" role="status" v-if="cooldown">Limite de sincronizações atingido. Tente de novo mais tarde.</p>
            <div class="int-actions" v-if="isAdmin">
                <button type="button" class="btn btn-primary" v-if="view === 'reauth_required'" :disabled="state.connecting"
                    :class="{ 'btn-loading': state.connecting }" v-on:click="$googleCalendar.connect()">Reconectar Google</button>
                <button type="button" class="btn btn-primary" v-else-if="state.premium !== false" :disabled="state.syncing || cooldown"
                    :class="{ 'btn-loading': state.syncing }" v-on:click="$googleCalendar.syncNow()">
                    <font-awesome icon="rotate" aria-hidden="true" /> Sincronizar agora
                </button>
                <button type="button" class="btn btn-red" :disabled="state.disconnecting"
                    :class="{ 'btn-loading': state.disconnecting }" v-on:click="$emit('disconnect')">Desconectar</button>
            </div>
            <p class="fontsize-sm cinza" v-else>Somente o administrador pode sincronizar, reconectar ou desconectar.</p>
        </template>
    </section>
</template>

<script>
import { CONNECTION_LABELS } from '../../utils/instagram.js';
import { syncSummary, lastErrorMessage, PUSH_LATENCY_NOTE } from '../../utils/googleCalendar.js';

// Estado da conexão com o Google Agenda: conta, última sincronização, erros e ações do administrador.
export default {
    emits: ['disconnect'],
    computed: {
        state() { return this.$googleCalendar.state; },
        view() { return this.$googleCalendar.view(); },
        label() { return CONNECTION_LABELS[this.view] || ""; },
        isAdmin() { return this.$myFunctions.hasPermission(this); },
        summary() { return syncSummary(this.state.account, this.state.links); },
        errorMessage() { return this.state.account ? lastErrorMessage(this.state.account.lastErrorCode) : ''; },
        latencyNote() { return PUSH_LATENCY_NOTE; },
        cooldown() { return this.state.syncCooldownUntil > Date.now(); },
        tagClass() {
            if (this.view === 'connected') return 'green';
            if (this.view === 'error') return 'red';
            if (this.view === 'reauth_required') return 'yellow';
            return '';
        }
    }
}
</script>

<style scoped>
.account {
    overflow-wrap: anywhere;
}
</style>
