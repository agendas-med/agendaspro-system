import axios from 'axios';
import { createApiClient } from '../utils/apiClient.js';
import { apiErrorMessage } from '../utils/errors.js';
import { BILLING_DISABLED_MESSAGE } from '../utils/planErrors.js';

// Adaptador fino: toda a lógica (refresh com trava, tolerância a contratos) vive em utils/apiClient.js.
export default defineNuxtPlugin((nuxtApp) => {
    const url_api = useRuntimeConfig().public.apiBase;

    const client = createApiClient({
        axios,
        baseURL: url_api,
        storage: localStorage,
        // 402: abre o modal de upgrade. 503 billing_disabled: aviso simples. Ambos marcam o erro como tratado.
        onPlanUpgradeRequired: (info, error) => {
            const g = nuxtApp.$global;
            g.handledError.at = Date.now();
            g.handledError.message = apiErrorMessage(error);
            g.upgradePrompt.info = info;
            g.upgradePrompt.show = true;
        },
        onBillingDisabled: (error) => {
            const g = nuxtApp.$global;
            g.handledError.at = Date.now();
            g.handledError.message = apiErrorMessage(error);
            nuxtApp.$myFunctions.showToast(nuxtApp, BILLING_DISABLED_MESSAGE, 'warning');
        },
        onSessionExpired: () => {
            // Nunca redireciona se já estiver numa rota pública (evita loop em /entrar).
            const route = nuxtApp.$router.currentRoute.value;
            const access = route.meta && route.meta.access;
            if (access === 'public' || access === 'guest') return;
            nuxtApp.$myFunctions.resetSession();
            navigateTo('/entrar');
        }
    });

    nuxtApp.provide('base', {
        api: client.api,
        client
    });
});
