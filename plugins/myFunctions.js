import {
  formatTel, returnCleanNumber, formatCpf, formatDate, formatHour, formatDateFromDB,
  returnAge, formatCurrency, returnFloatNumber, capitalize, formatMinutesToTime, formatDuration,
} from "../utils/format.js";
import { apiErrorMessage, toDisplayText } from "../utils/errors.js";
import { isAdminUser } from "../utils/access.js";
import { isAlreadyHandled } from "../utils/planErrors.js";
import { resolveFileUrl } from "../utils/files.js";
import { formatCents, formatBps } from "../utils/money.js";

export default defineNuxtPlugin((nuxtApp) => {
  // Métodos de resposta
  // msg pode ser string, objeto de erro da API ou erro do axios: sempre vira texto.
  const setResponse = (instance, msg, type) => {
    instance.response = toDisplayText(msg);
    instance.responseType = type;
  };

  const resetResponse = (instance) => {
    instance.response = "";
    instance.responseType = "";
  };

  //Métodos de navegação
  const goToSubRoute = (instance, index, mainRoute, tabs = []) => {
    instance.$router.push("/" + mainRoute + "/" + tabs[index].route);
  };

  //Métodos de modal
  const openModal = ({
    instance,
    title,
    saveButton,
    saveButton2 = "",
    cancelButton,
    props = {},
    modalContentVariable = "",
    contentObject = null,
  }) => {
    instance.$global.modalUtils.modalTitle = title;
    instance.$global.modalUtils.modalSaveButton = saveButton;
    instance.$global.modalUtils.modalSaveButton2 = saveButton2;
    instance.$global.modalUtils.modalCancelButton = cancelButton;
    instance.$global.modalUtils.isLoading = false;

    if (contentObject) {
      instance.$global.contentObject = JSON.parse(
        JSON.stringify(contentObject),
      );

      if ("internalTitle" in instance.$global.contentObject) {
        instance.$global.modalUtils.internalTitle =
          instance.$global.contentObject.internalTitle;
      }
    }

    for (const [key, value] of Object.entries(props)) {
      instance[key] = value;
    }

    if (modalContentVariable !== "") {
      instance[modalContentVariable] = true;
    }
  };

  const stopModalLoading = (instance) => {
    if (instance.$global && instance.$global.modalUtils) {
      instance.$global.modalUtils.isLoading = false;
    }
  };

  const showFeedbackModal = (instance, title, message, type = "success") => {
    // 402/503 já tratados pelo interceptor (modal de upgrade/toast): não duplica o aviso.
    if (type === "error" && isAlreadyHandled(nuxtApp.$global.handledError, toDisplayText(message))) return;
    instance.$global.modalUtils.feedback.title = title;
    instance.$global.modalUtils.feedback.message = toDisplayText(message);
    instance.$global.modalUtils.feedback.type = type;
    instance.$global.modalUtils.feedback.show = true;
    instance.$global.modalUtils.feedback.isClosing = false;
  };

  const closeFeedbackModal = (instance) => {
    instance.$global.modalUtils.feedback.isClosing = true;
    setTimeout(() => {
      instance.$global.modalUtils.feedback.show = false;
      instance.$global.modalUtils.feedback.title = "";
      instance.$global.modalUtils.feedback.message = "";
    }, 400);
  };

  // Toasts (avisos não bloqueantes)
  let toastSeq = 0;
  const dismissToast = (id) => {
    const items = nuxtApp.$global.toasts.items;
    const index = items.findIndex((t) => t.id === id);
    if (index >= 0) items.splice(index, 1);
  };

  const showToast = (instance, message, type = "info", duration = 6000) => {
    const id = ++toastSeq;
    nuxtApp.$global.toasts.items.push({ id, message: toDisplayText(message), type });
    if (duration > 0) setTimeout(() => dismissToast(id), duration);
    return id;
  };

  // Erro de requisição -> toast em linguagem amigável (sem despejar objetos).
  const notifyError = (instance, error, fallback) => {
    if (error && error.handledGlobally) return null;
    return showToast(instance, apiErrorMessage(error, fallback), "error");
  };

  // Diálogo de confirmação baseado em promessa (substitui window.confirm).
  let confirmResolver = null;
  const confirmDialog = ({
    title = "Confirmar",
    message = "",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = false,
  } = {}) => {
    if (confirmResolver) confirmResolver(false);
    const state = nuxtApp.$global.confirmDialog;
    Object.assign(state, { show: true, title, message, confirmLabel, cancelLabel, danger });
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  };

  const answerConfirm = (answer) => {
    nuxtApp.$global.confirmDialog.show = false;
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(!!answer);
    }
  };

  const closeModal = (instance, props = [], reload = false) => {
    instance.$global.modalUtils.isClosing = true;

    setTimeout(() => {
      instance.$global.modalUtils.modalTitle = "";
      instance.$global.modalUtils.modalSaveButton = "";
      instance.$global.modalUtils.modalCancelButton = "";
      instance.$global.modalUtils.isClosing = false;

      for (let i = 0; i < props.length; i++) {
        instance[props[i]] = "";
      }

      instance.$global.contentObject = { id: 0 };

      let targets = Object.keys(instance.$data).filter((key) =>
        key.includes("modalContent"),
      );

      for (let i = 0; i < targets.length; i++) {
        instance[targets[i]] = false;
      }

      if (instance.$global.modalUtils.isLoading !== undefined) {
        instance.$global.modalUtils.isLoading = false;
      }

      if (reload) {
        instance.$router.go(0);
      }
    }, 400);
  };

  //Métodos de manipulação de valores
  const formatTelInput = (event, tel) => {
    if (tel == null) return "";

    let element = event.target;
    let cleaned = tel.replace(/\D/g, "");

    if (cleaned.length === 11) {
      cleaned = cleaned.replace(
        /^(\d{2})(\d{1})(\d{4})(\d{4})$/,
        "($1) $2 $3-$4",
      );
    } else if (cleaned.length === 10) {
      cleaned = cleaned.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
    }

    element.value = cleaned;
  };

  const formatCpfInput = (event, cpf) => {
    if (cpf == null) return "";

    let element = event.target;
    let cleaned = cpf.replace(/\D/g, "");

    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }

    if (cleaned.length === 11) {
      cleaned = cleaned.replace(
        /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
        "$1.$2.$3-$4",
      );
    }

    element.value = cleaned;
  };

  const inputMoneyCheck = function (event) {
    var valor = event.target.value.replace(/\D/g, "");
    var valorNumerico = parseInt(valor) / 100;
    var valorFormatado = valorNumerico.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    event.target.value = valorFormatado;

    event.target.setSelectionRange(
      valorFormatado.length,
      valorFormatado.length,
    );
  };

  //Métodos validação

  const formCustomValidate = (instance) => {
    if ($(".custom-invalid[invalid='true']").length) {
      $(".custom-invalid[invalid='true']").addClass("invalid");
      instance.$myFunctions.setResponse(
        instance,
        "Campos não podem ser vazios",
        "error",
      );
      instance.$global.screenUtils.invalidForm = true;

      return false;
    } else {
      $(".custom-invalid[invalid='true']").removeClass("invalid");
      instance.$global.screenUtils.invalidForm = false;

      return true;
    }
  };

  //Metodos autenticação
  // A sessão é validada no boot (getUser) e, depois, só em respostas 401 (interceptor em utils/apiClient.js).
  const setJwtInLocalStorage = (instance, token) => {
    localStorage.setItem("agendaspro_jwt", token);
  };

  const getJwtInLocalStorage = () => {
    return localStorage.getItem("agendaspro_jwt");
  };

  const removeJwtFromLocalStorage = () => {
    localStorage.removeItem("agendaspro_jwt");
    localStorage.removeItem("agendaspro_refresh_token");
  };

  // Guarda o resultado do login (jwtToken/token + refresh_token, se existir).
  const storeLoginResponse = (instance, data) => {
    return nuxtApp.$base.client.storeLoginResponse(data);
  };

  const logoutUser = async () => {
    try {
      await nuxtApp.$base.client.logout();
    } catch (e) {
      removeJwtFromLocalStorage();
    }
    resetSession();
    window.location.href = "/entrar";
  };

  const enterCompanyWithToken = (instance, token, email) => {
    return instance.$base.api
      .post("/companies/enter_company", { token: token, email: email })
      .then(() => undefined);
  };

  const checkAndSetJwt = (instance) => {
    const jwt = getJwtInLocalStorage();
    if (!jwt) return Promise.resolve(false);
    instance.$base.api.defaults.headers.common.Authorization = `Bearer ${jwt}`;
    Object.assign(instance.$global.jwtLoaded, { loaded: true });
    return Promise.resolve(true);
  };

  // Sessão compartilhada: middleware e layout aguardam a mesma promessa.
  // status: "ok" | "unauthenticated" | "no-company" | "error"
  let sessionPromise = null;

  const resetSession = () => {
    sessionPromise = null;
    // O assistente guarda conversas e tokens de confirmação em memória: nada sobrevive a logout/sessão expirada.
    if (nuxtApp.$assistant) nuxtApp.$assistant.reset();
    // Conexões, métricas e vínculos das integrações também não atravessam logout ou troca de empresa.
    if (nuxtApp.$instagram) nuxtApp.$instagram.reset();
    if (nuxtApp.$googleCalendar) nuxtApp.$googleCalendar.reset();
  };

  const bootSession = async (instance) => {
    if (!(await checkAndSetJwt(instance))) return { status: "unauthenticated" };

    try {
      await getUser(instance); // valida o token (e renova via 401, se preciso)
    } catch (error) {
      if (error && error.response && error.response.status === 401) {
        removeJwtFromLocalStorage();
        return { status: "unauthenticated" };
      }
      return { status: "error", error };
    }

    if (!instance.$global.selectedCompany.id) return { status: "no-company" };

    try {
      await Promise.all([
        getUnitsOfMeasurement(instance),
        returnBusinessTypes(instance),
        getCompany(instance),
      ]);
    } catch (error) {
      if (error && error.response && error.response.status === 401) {
        removeJwtFromLocalStorage();
        return { status: "unauthenticated" };
      }
      return { status: "error", error };
    }

    return { status: "ok" };
  };

  const ensureSession = (instance = nuxtApp, force = false) => {
    if (!sessionPromise || force) {
      const current = bootSession(instance).then((result) => {
        // Só mantém em cache o sucesso; falhas são reavaliadas na próxima navegação.
        if (result.status !== "ok" && sessionPromise === current) sessionPromise = null;
        return result;
      });
      sessionPromise = current;
    }
    return sessionPromise;
  };

  // Compatibilidade: true se a sessão está pronta.
  const initSystem = async (instance) => {
    const result = await ensureSession(instance);
    if (result.status === "error") throw result.error || new Error("Falha ao iniciar o sistema");
    return result.status === "ok";
  };

  //Métodos de retorno

  const returnBusinessTypes = async (instance) => {
    const response = await instance.$base.api.get('/companies/business_types');
    Object.assign(instance.$global.business_types, { types: response.data.returnObj });
  };

  const getAddressData = async (cep) => {
    if (!/^\d{5}-?\d{3}$/.test(cep)) {
      throw new Error("CEP inválido");
    }

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) {
      throw new Error("Falha ao consultar o CEP");
    }

    const results = await response.json();
    if (results.erro) {
      throw new Error("CEP não encontrado");
    }

    return results;
  };

  const getCompany = async function (instance) {
    const response = await instance.$base.api.get('/companies');
    Object.assign(instance.$global.company, response.data.returnObj);
  };

  const getUser = function (instance) {
    return new Promise((resolve, reject) => {
      instance.$base.api
        .get("/users", {
          headers: {
            "Selected-company": localStorage.getItem("selected_company"),
          },
        })
        .then(function (response) {
          Object.assign(instance.$global.user, response.data.returnObj);

          const ids = response.data.returnObj.companies;
          const selected = Number(localStorage.getItem('selected_company'));
          const company_id = ids.includes(selected) ? selected : ids[0] || null;
          if (company_id) localStorage.setItem('selected_company', String(company_id));
          else localStorage.removeItem('selected_company');

          Object.assign(instance.$global.selectedCompany, { id: company_id });

          instance.$base.api.defaults.headers.common["Selected-company"] =
            instance.$global.selectedCompany.id;

          resolve();
        }).catch(reject);
    });
  };

  const getUnitsOfMeasurement = async function (instance) {
    const response = await instance.$base.api.get('/utils/units_of_measurement');
    instance.$global.unitsOfMeasurement = response.data.returnObj;
  };

  // URL de imagem/arquivo vinda da API: /public -> /static, /files/s3/<chave> como veio, relativa -> base da API.
  const fileUrl = (url) => resolveFileUrl(url, useRuntimeConfig().public.apiBase);

  const hasPermission = function (instance) {
    return isAdminUser(instance.$global.user);
  };

  nuxtApp.provide("myFunctions", {
    setResponse,
    resetResponse,
    goToSubRoute,
    openModal,
    stopModalLoading,
    closeModal,
    formatTel,
    returnCleanNumber,
    formatTelInput,
    formatCpfInput,
    formatDate,
    formatHour,
    formatDateFromDB,
    formatCpfFromDB: formatCpf,
    returnAge,
    formatCurrency,
    formatDuration,
    formatCents,
    formatBps,
    fileUrl,
    inputMoneyCheck,
    capitalize,
    formatMinutesToTime,
    returnFloatNumber,
    errorMessage: apiErrorMessage,
    notifyError,
    showToast,
    dismissToast,
    confirmDialog,
    answerConfirm,
    logoutUser,
    initSystem,
    ensureSession,
    resetSession,
    checkAndSetJwt,
    storeLoginResponse,
    returnBusinessTypes,
    enterCompanyWithToken,
    removeJwtFromLocalStorage,
    getJwtInLocalStorage,
    setJwtInLocalStorage,
    getAddressData,
    getCompany,
    getUser,
    hasPermission,
    formCustomValidate,
    getUnitsOfMeasurement,
    closeFeedbackModal,
    showFeedbackModal,
  });
});
