// Regras de acesso por rota (puras, testáveis). O nível vem de definePageMeta({ access }).
//   public : qualquer visitante (login, registro, 404...)
//   guest  : visitante; quem já tem sessão válida é enviado à agenda
//   user   : exige token, mas não exige empresa (criar/trocar empresa)
//   member : exige sessão com empresa selecionada (padrão para páginas sem meta)
//   admin  : member + permissão de administrador (permission == 1)
export const ACCESS = {
  PUBLIC: "public",
  GUEST: "guest",
  USER: "user",
  MEMBER: "member",
  ADMIN: "admin",
};

export const LOGIN_PATH = "/entrar";
export const HOME_PATH = "/agenda";
export const CREATE_COMPANY_PATH = "/criar-empresa";
export const DENIED_PATH = "/acesso-negado";

export function resolveAccess(meta) {
  const value = meta && meta.access;
  return Object.values(ACCESS).includes(value) ? value : ACCESS.MEMBER;
}

export function isAdminUser(user) {
  return !!user && user.permission == 1;
}

// A sessão (chamada à API) só é necessária em rotas protegidas ou ao detectar sessão em páginas de visitante.
export function needsSession(access, hasToken) {
  if (access === ACCESS.MEMBER || access === ACCESS.ADMIN) return hasToken;
  if (access === ACCESS.GUEST) return hasToken;
  return false;
}

// Retorna { allow: true } ou { redirect: "/caminho" }.
// session: { status: "ok" | "unauthenticated" | "no-company" | "error" } | null
export function decideAccess({ access, hasToken, session, user }) {
  switch (access) {
    case ACCESS.PUBLIC:
      return { allow: true };

    case ACCESS.GUEST:
      if (hasToken && session) {
        if (session.status === "ok") return { redirect: HOME_PATH };
        if (session.status === "no-company") return { redirect: CREATE_COMPANY_PATH };
      }
      return { allow: true };

    case ACCESS.USER:
      return hasToken ? { allow: true } : { redirect: LOGIN_PATH };

    case ACCESS.MEMBER:
    case ACCESS.ADMIN: {
      if (!hasToken) return { redirect: LOGIN_PATH };
      if (!session || session.status === "unauthenticated") return { redirect: LOGIN_PATH };
      if (session.status === "no-company") return { redirect: CREATE_COMPANY_PATH };
      // "error" (API fora do ar): deixa passar; o layout exibe a tela de erro com "Tentar novamente".
      if (session.status === "error") return { allow: true };
      if (access === ACCESS.ADMIN && !isAdminUser(user)) return { redirect: DENIED_PATH };
      return { allow: true };
    }

    default:
      return { redirect: LOGIN_PATH };
  }
}
