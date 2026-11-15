// Conversão de erros (axios, strings, objetos) em texto amigável em pt-BR.
// Tolerante ao formato antigo (string/objeto cru) e ao novo ({ error: { code, message } }).

const GENERIC = "Ocorreu um erro inesperado. Tente novamente.";

const STATUS_MESSAGES = {
  400: "Dados inválidos. Revise as informações e tente novamente.",
  401: "Sua sessão expirou. Entre novamente.",
  403: "Você não tem permissão para realizar esta ação.",
  404: "Recurso não encontrado.",
  409: "Conflito: o registro já existe ou foi alterado.",
  413: "O conteúdo enviado é grande demais.",
  422: "Dados inválidos. Revise as informações e tente novamente.",
  429: "Muitas tentativas. Aguarde um instante e tente novamente.",
  500: "Erro interno do servidor. Tente novamente em instantes.",
  502: "Serviço temporariamente indisponível. Tente novamente em instantes.",
  503: "Serviço temporariamente indisponível. Tente novamente em instantes.",
  504: "O servidor demorou para responder. Tente novamente.",
};

function isPlainText(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Extrai texto de um corpo de resposta de qualquer formato conhecido.
export function messageFromBody(body) {
  if (body == null) return "";

  if (typeof body === "string") {
    const text = body.trim();
    // Evita exibir páginas HTML de erro de proxies.
    if (/^<(!doctype|html)/i.test(text)) return "";
    return text;
  }

  if (Array.isArray(body)) {
    return body.map(messageFromBody).filter(Boolean).join("\n");
  }

  if (typeof body === "object") {
    if (body.error != null) {
      const fromError = messageFromBody(
        typeof body.error === "string" ? body.error : (body.error.message ?? body.error.details ?? ""),
      );
      if (fromError) return fromError;
    }
    if (isPlainText(body.message)) return body.message.trim();
    if (Array.isArray(body.errors)) {
      const joined = messageFromBody(body.errors);
      if (joined) return joined;
    }
    if (Array.isArray(body.details)) {
      const joined = body.details.map((d) => (d && d.message) || "").filter(Boolean).join("\n");
      if (joined) return joined;
    }
    if (isPlainText(body.msg)) return body.msg.trim();
  }

  return "";
}

// Código de erro padronizado ({ error: { code } }), se houver.
export function errorCode(err) {
  const body = err?.response?.data;
  const code = body?.error?.code;
  return typeof code === "string" ? code : "";
}

// Mensagem amigável para qualquer coisa jogada por um .catch.
export function apiErrorMessage(err, fallback = GENERIC) {
  if (err == null) return fallback;

  if (typeof err === "string") return messageFromBody(err) || fallback;

  // Erro do axios com resposta do servidor
  if (err.response) {
    const fromBody = messageFromBody(err.response.data);
    if (fromBody) return fromBody;
    return STATUS_MESSAGES[err.response.status] || fallback;
  }

  // Erros de rede e timeout (sem resposta)
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" || /timeout/i.test(err.message || "")) {
    return "O servidor demorou para responder. Verifique sua conexão e tente novamente.";
  }
  if (err.request || err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Não foi possível conectar ao servidor. Verifique sua conexão com a internet.";
  }

  // Corpo de resposta já extraído (ex.: error.response.data repassado adiante)
  if (typeof err === "object" && !(err instanceof Error)) {
    const fromBody = messageFromBody(err);
    if (fromBody) return fromBody;
    return fallback;
  }

  if (err instanceof Error && isPlainText(err.message)) return err.message;

  return fallback;
}

// Garante que qualquer valor vire texto exibível (nunca "[object Object]").
export function toDisplayText(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return apiErrorMessage(value, fallback || GENERIC);
}
