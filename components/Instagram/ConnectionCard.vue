<template>
    <section class="int-card" aria-labelledby="ig-conn-title">
        <header class="int-card-header">
            <h2 class="fontsize-lg-bold preto" id="ig-conn-title">
                <font-awesome :icon="['fab', 'instagram']" aria-hidden="true" /> Conta do Instagram
            </h2>
            <span class="tag" :class="tagClass" role="status">{{ label }}</span>
        </header>

        <p class="fontsize-md cinza" role="status" v-if="view === 'loading'">Verificando a conexão…</p>

        <template v-else-if="view === 'error'">
            <p class="fontsize-md preto" role="alert">{{ state.error ? state.error.message : "Não foi possível verificar a conexão." }}</p>
            <div class="int-actions">
                <button type="button" class="btn btn-cinza" v-on:click="$instagram.load()">Tentar novamente</button>
            </div>
        </template>

        <p class="fontsize-md cinza" v-else-if="view === 'not_configured'">
            A integração com o Instagram ainda não está disponível nesta plataforma. Nenhuma ação é necessária da sua parte.
        </p>

        <template v-else-if="view === 'disconnected' || view === 'connecting'">
            <p class="fontsize-md cinza">
                Conecte a conta profissional (comercial ou criador) do Instagram da empresa para acompanhar seguidores,
                publicações recentes e, no plano Premium, métricas e conversão em agendamentos. O AgendasPRO só lê dados;
                nunca publica nem envia mensagens por você.
            </p>
            <div class="int-actions" v-if="isAdmin">
                <button type="button" class="btn btn-primary" :class="{ 'btn-loading': view === 'connecting' }"
                    :disabled="view === 'connecting'" v-on:click="connect()">
                    {{ view === 'connecting' ? "Abrindo o Instagram…" : "Conectar Instagram" }}
                </button>
            </div>
            <p class="fontsize-md cinza" v-else>Somente o administrador da empresa pode conectar o Instagram.</p>
        </template>

        <template v-else>
            <div class="int-notice warning" role="alert" v-if="view === 'reauth_required'">
                <p class="fontsize-md preto">
                    O Instagram pediu uma nova autorização (a senha mudou ou a permissão expirou). Os dados abaixo podem estar
                    desatualizados até você reconectar.
                </p>
            </div>
            <InstagramProfile :account="state.account" v-if="state.account" />
            <p class="fontsize-sm cinza" v-if="state.stale" role="status">
                Mostrando os últimos dados salvos: o Instagram limitou as consultas por enquanto.
            </p>
            <div class="int-actions" v-if="isAdmin">
                <button type="button" class="btn btn-primary" v-if="view === 'reauth_required'" :disabled="state.connecting"
                    :class="{ 'btn-loading': state.connecting }" v-on:click="connect()">Reconectar Instagram</button>
                <button type="button" class="btn btn-cinza" v-else :disabled="state.refreshing"
                    :class="{ 'btn-loading': state.refreshing }" v-on:click="$instagram.refresh()">
                    <font-awesome icon="rotate" aria-hidden="true" /> Atualizar agora
                </button>
                <button type="button" class="btn btn-red" :disabled="state.disconnecting"
                    :class="{ 'btn-loading': state.disconnecting }" v-on:click="disconnect()">Desconectar</button>
            </div>
            <p class="fontsize-sm cinza" v-else>Somente o administrador pode reconectar ou desconectar a conta.</p>
        </template>
    </section>
</template>

<script>
import { CONNECTION_LABELS } from '../../utils/instagram.js';

// Estado da conexão com o Instagram e ações do administrador (conectar, reconectar, atualizar, desconectar).
export default {
    computed: {
        state() { return this.$instagram.state; },
        view() { return this.$instagram.view(); },
        label() { return CONNECTION_LABELS[this.view] || ""; },
        isAdmin() { return this.$myFunctions.hasPermission(this); },
        tagClass() {
            if (this.view === 'connected') return 'green';
            if (this.view === 'error') return 'red';
            if (this.view === 'reauth_required') return 'yellow';
            return '';
        }
    },
    methods: {
        connect() {
            return this.$instagram.connect();
        },
        async disconnect() {
            const sure = await this.$myFunctions.confirmDialog({
                title: 'Desconectar o Instagram?',
                message: 'Os dados da conta (perfil, publicações, métricas e histórico) serão apagados do AgendasPRO e o acompanhamento será interrompido. '
                    + 'Seus links já divulgados continuam funcionando. Você pode conectar novamente quando quiser.',
                confirmLabel: 'Desconectar',
                danger: true
            });
            if (sure) await this.$instagram.disconnect();
        }
    }
}
</script>
