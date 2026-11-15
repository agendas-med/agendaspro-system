import axios from 'axios';
import { createApiClient } from '../utils/apiClient.js';

// Adaptador fino: toda a lógica (refresh com trava, tolerância a contratos) vive em utils/apiClient.js.
export default defineNuxtPlugin((nuxtApp) => {
    const url_api = useRuntimeConfig().public.apiBase;

    const client = createApiClient({
        axios,
        baseURL: url_api,
        storage: localStorage,
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
