import { reactive } from 'vue';
import { createInstagramController, initialState as instagramState } from '../utils/instagramController.js';
import { createGoogleCalendarController, initialState as googleState } from '../utils/googleCalendarController.js';

// Estado e fluxos das integrações Instagram e Google Agenda (utils/*Controller.js), compartilhados entre telas.
// O estado precisa ser reactive para a interface acompanhar o que o controlador altera.
// O cliente da API é resolvido na hora do uso (a ordem de carga dos plugins não importa).
export default defineNuxtPlugin((nuxtApp) => {
    const api = {
        get: (...args) => nuxtApp.$base.api.get(...args),
        post: (...args) => nuxtApp.$base.api.post(...args),
        delete: (...args) => nuxtApp.$base.api.delete(...args)
    };
    const environment = {
        api,
        storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        origin: () => window.location.origin,
        navigate: (url) => { window.location.assign(url); },
        // authorize_url em http local só vale em desenvolvimento (mock).
        allowLocal: import.meta.dev === true,
        companyId: () => localStorage.getItem('selected_company') || ''
    };
    nuxtApp.provide('instagram', createInstagramController({ ...environment, state: reactive(instagramState()) }));
    nuxtApp.provide('googleCalendar', createGoogleCalendarController({ ...environment, state: reactive(googleState()) }));
});
