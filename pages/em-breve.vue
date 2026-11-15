<template>
  <main class="soon text-center">
    <font-awesome icon="circle-info" class="soon-icon cinza" aria-hidden="true" />
    <h1 class="fontsize-xl-bold preto mt-4">Em breve</h1>
    <p class="fontsize-md cinza mt-2">Esta funcionalidade ainda está em desenvolvimento e chegará em uma próxima versão.</p>
    <NuxtLink to="/agenda" class="btn btn-primary mt-6 soon-link">Voltar para a agenda</NuxtLink>
  </main>
</template>

<script setup>
// Destino genérico para recursos ainda não disponíveis; não aparece na navegação.
definePageMeta({ access: 'member', title: 'Em breve' })
</script>

<style scoped>
.soon {
  padding: var(--space-8, 32px) var(--space-6);
}

.soon-icon {
  font-size: 3rem;
}

.soon-link {
  margin-left: auto;
  margin-right: auto;
  text-decoration: none;
}
</style>
