import { reactive } from 'vue';
import { createAssistantController, initialState } from '../utils/assistantController.js';

// Estado e fluxos do assistente interno (utils/assistantController.js), compartilhados entre menu e telas.
// O estado precisa ser reactive para a interface acompanhar o que o controlador altera.
// O cliente da API é resolvido na hora do uso (a ordem de carga dos plugins não importa).
export default defineNuxtPlugin((nuxtApp) => {
    const api = {
        get: (...args) => nuxtApp.$base.api.get(...args),
        post: (...args) => nuxtApp.$base.api.post(...args),
        delete: (...args) => nuxtApp.$base.api.delete(...args)
    };
    nuxtApp.provide('assistant', createAssistantController({ api, state: reactive(initialState()) }));
});
