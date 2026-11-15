<template>
  <main class="denied text-center">
    <font-awesome icon="user-lock" class="denied-icon cinza" aria-hidden="true" />
    <h1 class="fontsize-xl-bold preto mt-4">Acesso negado</h1>
    <p class="fontsize-md cinza mt-2">
      Você não tem permissão para acessar esta página. Peça a um administrador da empresa para liberar o acesso.
    </p>
    <NuxtLink to="/agenda" class="btn btn-primary mt-6 denied-link">Voltar para a agenda</NuxtLink>
  </main>
</template>

<script setup>
definePageMeta({ access: 'member', title: 'Acesso negado' })
</script>

<style scoped>
.denied {
  padding: var(--space-8, 32px) var(--space-6);
}

.denied-icon {
  font-size: 3rem;
}

.denied-link {
  margin-left: auto;
  margin-right: auto;
  text-decoration: none;
}
</style>
