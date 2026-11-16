<template>
    <section>
        <UtilsPageheader title="Instagram" subtitle="Finalizando a conexão da conta." />
        <IntegrationsCallback provider="instagram" name="Instagram" return-path="/integracoes/instagram" />
    </section>
</template>

<script setup>
// Retorno do Instagram (redirect_uri). Somente o administrador conecta.
definePageMeta({ access: 'admin', title: 'Instagram' })
</script>
