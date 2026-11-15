<template>
  <div>
    <!-- O layout vem de definePageMeta({ layout }) em cada página (padrão: default). -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UtilsFeedbackModal />
    <UtilsConfirmDialog />
    <UtilsUpgradeModal />
    <UtilsToast />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const route = useRoute()

// Título por página: definePageMeta({ title }).
useHead({
  title: computed(() => (route.meta && route.meta.title ? `${route.meta.title} | AgendasPro` : 'AgendasPro'))
})
</script>
