import { reactive } from 'vue';
import { createBadgeController, initialBadgeState } from '../utils/whatsappBadge.js';

// Selo de conversas aguardando (menu e abas do WhatsApp): estado único e um só polling (utils/whatsappBadge.js).
// O cliente da API é resolvido na hora do uso (a ordem de carga dos plugins não importa).
export default defineNuxtPlugin((nuxtApp) => {
    const api = {
        get: (...args) => nuxtApp.$base.api.get(...args)
    };
    nuxtApp.provide('whatsappBadge', createBadgeController({
        api,
        state: reactive(initialBadgeState()),
        isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    }));
});
