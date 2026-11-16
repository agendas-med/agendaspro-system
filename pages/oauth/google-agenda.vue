<template>
    <section>
        <UtilsPageheader title="Google Agenda" subtitle="Finalizando a conexão da conta." />
        <IntegrationsCallback provider="googleCalendar" name="Google Agenda" return-path="/integracoes/google-agenda" />
    </section>
</template>

<script setup>
// Retorno do Google (redirect_uri). Somente o administrador conecta.
definePageMeta({ access: 'admin', title: 'Google Agenda' })
</script>
