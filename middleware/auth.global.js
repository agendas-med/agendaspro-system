import { decideAccess, needsSession, resolveAccess, LOGIN_PATH } from '../utils/access.js';
import { TOKEN_KEY } from '../utils/apiClient.js';

// Guarda global de rotas. O nível de acesso vem de definePageMeta({ access })
// (public | guest | user | member | admin); páginas sem meta são "member".
// A sessão é validada uma vez (boot) e reutilizada pelo layout; depois só em respostas 401.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const nuxtApp = useNuxtApp();
  const access = resolveAccess(to.meta);
  const hasToken = !!localStorage.getItem(TOKEN_KEY);

  let session = null;
  if (needsSession(access, hasToken)) {
    session = await nuxtApp.$myFunctions.ensureSession(nuxtApp);
  }

  const decision = decideAccess({ access, hasToken, session, user: nuxtApp.$global.user });
  if (decision.redirect && decision.redirect !== to.path) {
    return navigateTo(decision.redirect, { replace: true });
  }
  if (decision.redirect === LOGIN_PATH && to.path === LOGIN_PATH) return;
});
