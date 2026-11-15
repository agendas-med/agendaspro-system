<template>
  <main class="not-found text-center">
    <p class="fontsize-xl-bold verde-escuro">404</p>
    <h1 class="fontsize-xl-bold preto mt-2">Página não encontrada</h1>
    <p class="fontsize-md cinza mt-2">O endereço que você acessou não existe ou foi movido.</p>
    <NuxtLink :to="loggedIn ? '/agenda' : '/entrar'" class="btn btn-primary mt-6 not-found-link">
      {{ loggedIn ? 'Ir para a agenda' : 'Ir para o login' }}
    </NuxtLink>
  </main>
</template>

<script>
export default {
  data() {
    return { loggedIn: false }
  },
  mounted() {
    this.loggedIn = !!this.$myFunctions.getJwtInLocalStorage();
  }
}
</script>

<script setup>
definePageMeta({ layout: 'clean-page', access: 'public', title: 'Página não encontrada' })
</script>

<style scoped>
.not-found {
  padding: var(--space-6);
}

.not-found-link {
  margin-left: auto;
  margin-right: auto;
  text-decoration: none;
}
</style>
