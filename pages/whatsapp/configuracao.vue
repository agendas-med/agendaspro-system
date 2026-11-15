<template>
    <section class="wa-config" :aria-busy="loading ? 'true' : 'false'">
        <UtilsLoading :loading="loading" />

        <div v-if="loadError && !loading" class="empty-state text-center" role="alert">
            <h2>{{ loadError }}</h2>
            <button type="button" class="btn btn-primary mt-4 mx-auto" v-on:click="load()">Tentar novamente</button>
        </div>

        <div class="wa-stack" v-if="!loading && !loadError">
            <WhatsappStatusCard :status="status" />
            <WhatsappUsageCard />
            <WhatsappConfigForm :status="status" :is-admin="isAdmin" @saved="onSaved" />
            <WhatsappTemplatesTable />
        </div>
    </section>
</template>

<script>
import { normalizeStatus } from '../../utils/whatsapp.js';
import { unwrap } from '../../utils/payloads.js';

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            status: normalizeStatus(null)
        };
    },
    computed: {
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        async load() {
            this.loading = true;
            this.loadError = "";
            try {
                this.status = normalizeStatus(unwrap(await this.$base.api.get("/whatsapp/status")));
            } catch (error) {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar o WhatsApp.");
            } finally {
                this.loading = false;
            }
        },
        onSaved(raw) {
            // PUT /whatsapp/config devolve o status completo.
            if (raw) this.status = normalizeStatus(raw);
        }
    }
}
</script>

<style scoped>
.wa-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'WhatsApp - Configuração' })
</script>
