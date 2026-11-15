<template>
    <div class="authentication-page-internal">
      <div class="authentication-header text-left">
        <h1 class="fontsize-xl-bold preto">Trocar de empresa</h1>
        <p class="fontsize-md cinza">Entre em outra empresa que você faz parte ou crie uma nova.</p>
        <div class="companies-list">
          <p class="fontsize-md cinza" v-if="loading">Carregando empresas...</p>
          <p class="fontsize-md vermelho" v-else-if="loadError" role="alert">{{ loadError }}</p>
          <p class="fontsize-md cinza" v-else-if="!companiesList.length">Você ainda não faz parte de nenhuma empresa. Crie a primeira abaixo.</p>
          <button type="button" class="company" v-for="company in companiesList" :key="company.id"
            :aria-label="'Entrar na empresa ' + company.name" v-on:click="goToCompany(company.id)">
            <span class="fontsize-md cinza">{{ company.name }}</span>
            <font-awesome icon="angle-right" aria-hidden="true" />
          </button>
        </div>
        <button type="button" class="btn btn-primary" v-on:click="createCompany()">Criar empresa</button>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    data() {
      return {
        companiesList: [],
        loading: true,
        loadError: ""
      }
    },
    mounted: function () {
      this.returnCompaniesList();
    },
    methods: {
      returnCompaniesList: function () {
        // O header Authorization é adicionado pelo interceptor do cliente de API.
        this.$base.api.get("/users/return_companies")
        .then((response) => {
          this.companiesList = response.data.returnObj || [];
        }).catch((error) => {
          this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar suas empresas");
        }).then(() => {
          this.loading = false;
        })
      },
      goToCompany: function (company_id) {
        localStorage.setItem("selected_company", company_id);
        // Recarrega de verdade: a sessão (empresa, permissões) fica em cache durante o boot.
        window.location.href = "/agenda";
      },
      createCompany: function () {
        this.$router.push("/criar-empresa");
      }
    }
  }
  </script>
<style scoped>
.companies-list {
  margin: var(--space-10) 0;
}

.company {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--cinza-medio);
  cursor: pointer;
  width: 100%;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  text-align: left;

  & svg {
    transition: transform 0.4s ease-in-out;
    transform: translateX(-7px);
  }

  &:hover, &:focus-visible {
    & span {
      transition: color 0.4s ease-in-out;
      color: var(--black);
    }

    & svg {
      transform: translateX(-3px);
    }
  }

  &:last-child {
    border-bottom: none;
  }
}
</style>

<script setup>
definePageMeta({ layout: 'login', access: 'user', title: 'Trocar de empresa' })
</script>
