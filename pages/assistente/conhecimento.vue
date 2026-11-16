<template>
    <section>
        <AssistantKnowledgePanel v-if="isAdmin" />
    </section>
</template>

<script>
export default {
    computed: {
        isAdmin() { return this.$myFunctions.hasPermission(this); }
    }
}
</script>

<script setup>
// Só administradores: o middleware redireciona os demais, e o painel não chama o core sem a permissão.
definePageMeta({ access: 'admin', title: 'Assistente - Base de conhecimento' })
</script>
