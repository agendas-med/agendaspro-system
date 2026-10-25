export default defineNuxtPlugin((nuxtApp) => {
  // Métodos de resposta
  const setResponse = (instance, msg, type) => {
    instance.response = msg;
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
    instance.$global.modalUtils.feedback.title = title;
    instance.$global.modalUtils.feedback.message = message;
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
  const formatTel = (tel) => {
    if (tel == null) return "";

    const cleaned = tel.replace(/\D/g, "");

    if (cleaned.length === 11) {
      return cleaned.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})$/, "($1) $2 $3-$4");
    } else if (cleaned.length === 10) {
      return cleaned.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
    }

    return tel;
  };

  const returnCleanNumber = (number) => {
    if (number == null) return "";

    const cleaned = number.replace(/\D/g, "");

    return cleaned;
  };

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

  const formatDate = (date) => {
    return date.trim() != "" ? moment(date).format("DD/MM/YYYY") : "";
  };

  const formatHour = (date) => {
    return date.trim() != "" ? moment(date).format("HH:mm") : "";
  };

  const formatDateFromDB = (date) => {
    return date.trim() != "" ? moment(date).format("YYYY-MM-DD") : "";
  };

  const formatCpfFromDB = (cpf) => {
    if (cpf == null) return "";

    const cleaned = cpf.replace(/\D/g, "");

    if (cleaned.length === 11) {
      return cleaned.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }

    return cpf;
  };

  const returnAge = (birthday) => {
    const dataNasc = moment(birthday, "YYYY-MM-DD");
    const hoje = moment();

    // Calcula a diferença em anos
    const anos = hoje.diff(dataNasc, "years");

    // Retorna a idade formatada
    return anos === 1 ? `${anos} Ano` : `${anos} Anos`;
  };

  const formatCurrency = (value) => {
    if (isNaN(value)) return "Valor inválido";

    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const returnFloatNumber = (string) => {
    let cleaned = string
      .toString()
      .replace(/R\$\s?/g, "")
      .trim();
    if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    let formattedNumber = parseFloat(cleaned);

    return formattedNumber.toFixed(2);
  };

  const capitalize = (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const formatMinutesToTime = (minutes) => {
    const duration = moment.duration(minutes, "minutes");

    // Calcula horas e minutos
    const hours = Math.floor(duration.asHours());
    const mins = duration.minutes();

    // Formata como HH:mm
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}h`;
  };

  const formatDuration = (minutes) => {
    if (!minutes || isNaN(minutes)) return "00:00"; // Retorna um valor padrão caso seja inválido

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const sanitizeHtml = (str) => {
    if (!str || (typeof str === "string" && str.trim() === "")) return "";

    const allowedTags = ["b", "i", "p", "br"];
    const regex = new RegExp(`<\/?(?!${allowedTags.join("|")})[^>]*>`, "gi");
    const withBreaks = str.replace(/\n/g, "<br>");
    const sanitized = withBreaks.replace(regex, "");

    return sanitized;
  };

  //Métodos validação

  const isValidRoute = (path) => {
    let routes = [
      "/agenda",
      "/vendas",
      "/clientes",
      "/relatorios",
      "/agenda",
      "/financeiro",
      "/financeiro/pagamentos",
      "/financeiro/servicos",
      "/financeiro/metodos-pagamento",
      "/configuracoes",
      "/configuracoes/usuarios",
      "/configuracoes/empresa",
      "/configuracoes/cargos",
      "/configuracoes/servicos",
      "/configuracoes/produtos",
      "/perfil",
      "/empresa_entrar",
      "/estoque",
    ];

    return routes.some((route) => route == path);
  };

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
  const setJwtInLocalStorage = (instance, token) => {
    localStorage.setItem("agendaspro_jwt", token);
  };

  const getJwtInLocalStorage = () => {
    return localStorage.getItem("agendaspro_jwt");
  };

  const removeJwtFromLocalStorage = () => {
    localStorage.removeItem("agendaspro_jwt");
  };

  const checkIfUserIsAuthenticated = (instance, first = false) => {
    return new Promise((resolve) => {
      let pathName = window.location.pathname;
      let jwt = "Bearer " + getJwtInLocalStorage();

      if (jwt == "Bearer null") {
        if (isValidRoute(pathName)) {
          window.location.href = "/entrar";
        }
        return resolve(false);
      } else {
        let data = {
          token: jwt,
        };

        instance.$base.api
          .post("/users/check_jwt", data) // Se ja estiver logado no sistema e acessar a página de login, é checkado a valia do token JWT e então redirecionado para a index.
          .then(function (res) {
            setJwtInLocalStorage(instance, res.data.returnObj.newToken); // Setando o novo jwt que foi resetado
            if (pathName == "/entrar") {
              // Se o usuário estiver logado e entrar em login, o mesmo é logado novamente e direcionado para a index.

              let loginForm = $("#login-form");
              loginForm.find("input").attr("disabled", "disabled");
              loginForm
                .find("button")
                .attr("disabled", "disabled")
                .addClass("btn-loading");

              setTimeout(() => {
                window.location.href = "/agenda";
              }, 1000);
            }
            resolve(true);
          })
          .catch(function () {
            // Caso contrário ele é deslogado e enviado para login.
            logoutUser();
            resolve(false);
          })
          .then(function () {
            // Chamada recursiva da função se o usuario estiver na home
            if (isValidRoute(pathName) && first) {
              setTimeout(() => {
                checkIfUserIsAuthenticated(instance, first);
              }, 10 * 1000);
            }
          });
      }
    });
  };

  const logoutUser = () => {
    removeJwtFromLocalStorage();

    window.location.href = "/entrar";
  };

  const enterCompanyWithToken = (instance, token, email) => {
    return new Promise((resolve, reject) => {
      instance.$base.api
        .post("/companies/enter_company", { token: token, email: email })
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  };

  const checkAndSetJwt = (instance) => {
    const jwt = getJwtInLocalStorage();
    if (!jwt) return Promise.resolve(false);
    instance.$base.api.defaults.headers.common.Authorization = `Bearer ${jwt}`;
    Object.assign(instance.$global.jwtLoaded, { loaded: true });
    return Promise.resolve(true);
  };

  const initSystem = async (instance) => {
    if (!await checkAndSetJwt(instance)) {
      window.location.href = '/entrar';
      return false;
    }
    if (!await checkIfUserIsAuthenticated(instance, true)) return false;
    await Promise.all([getUnitsOfMeasurement(instance), returnBusinessTypes(instance)]);
    await getUser(instance);
    if (!instance.$global.selectedCompany.id) {
      window.location.href = '/criar-empresa';
      return false;
    }
    await getCompany(instance);
    return true;
  };

  //Métodos de retorno

  const returnBusinessTypes = async (instance) => {
    const response = await instance.$base.api.get('/companies/business_types');
    Object.assign(instance.$global.business_types, { types: response.data.returnObj });
  };

  const getAddressData = (cep) => {
    return new Promise((resolve) => {
      if (!/^\d{5}-?\d{3}$/.test(cep)) {
        throw new Error("CEP inválido");
      }

      fetch(`https://viacep.com.br/ws/${cep}/json/`).then((response) => {
        if (!response.ok) {
          throw new Error("Falha ao consultar o ViaCEP");
        }

        response.json().then((results) => {
          if (results.erro) {
            throw new Error("CEP não encontrado");
          }

          resolve(results);
        });
      });
    });
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

  const hasPermission = function (instance) {
    return instance.$global.user.permission == 1;
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
    formatCpfFromDB,
    returnAge,
    sanitizeHtml,
    formatCurrency,
    formatDuration,
    inputMoneyCheck,
    capitalize,
    formatMinutesToTime,
    returnFloatNumber,
    logoutUser,
    initSystem,
    checkAndSetJwt,
    returnBusinessTypes,
    enterCompanyWithToken,
    checkIfUserIsAuthenticated,
    removeJwtFromLocalStorage,
    getJwtInLocalStorage,
    setJwtInLocalStorage,
    isValidRoute,
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
