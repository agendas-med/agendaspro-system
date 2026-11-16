<template>
    <header class="flex items-center justify-end ">
        <div class="responsive-menu-button">
            <button type="button" id="responsive-menu-button" aria-label="Abrir menu de navegação"
                v-on:click="$emit('toggleMenu')">
                <font-awesome icon="bars" aria-hidden="true" />
            </button>
        </div>
        <HeaderUser />
    </header>
</template>
<script>
export default {
    emits: ["toggleMenu"]
}
</script>
<style scoped>
    header {
        padding: 0 var(--space-6);
    }

    #responsive-menu-button {
        font-size: 25px;
        cursor: pointer;
        color: var(--cinza);
        background: none;
        border: 0;
        padding: 0;
        /* Alvo de toque mínimo de 44px sem mexer na altura do cabeçalho. */
        min-width: 44px;
        min-height: 44px;
        margin-left: calc(-1 * var(--space-3));
    }

    .responsive-menu-button {
        display: none;
    }

    @media (max-width: 1029px) {
        .responsive-menu-button {
            display: block;
        }

        header {
            justify-content: space-between !important;
        }
    }
</style>