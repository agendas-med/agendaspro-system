import vue3GoogleLogin from 'vue3-google-login';

// O clientId vem da configuração de runtime (NUXT_PUBLIC_GOOGLE_CLIENT_ID).
// Sem ele, o login com Google fica desativado (o botão é ocultado em components/Google/Auth.vue).
export default defineNuxtPlugin(nuxtApp => {
  const clientId = useRuntimeConfig().public.googleClientId;
  if (!clientId) return;

  nuxtApp.vueApp.use(vue3GoogleLogin, { clientId });
});
