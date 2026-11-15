<template>
  <div></div>
</template>

<script setup>
// "/" não tem conteúdo: leva quem tem sessão à agenda e os demais ao login.
definePageMeta({ layout: 'clean-page', access: 'public', title: 'AgendasPro' })

onMounted(() => {
  const loggedIn = !!localStorage.getItem('agendaspro_jwt')
  navigateTo(loggedIn ? '/agenda' : '/entrar', { replace: true })
})
</script>
