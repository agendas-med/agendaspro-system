<template>
    <TransitionGroup name="toast" tag="div" class="toast-region" aria-live="polite" aria-atomic="false">
        <div v-for="toast in $global.toasts.items" :key="toast.id" class="toast" :class="'toast-' + toast.type"
            :role="toast.type === 'error' ? 'alert' : 'status'">
            <p class="toast-message">{{ toast.message }}</p>
            <button type="button" class="icon-btn toast-close" aria-label="Fechar aviso"
                v-on:click="$myFunctions.dismissToast(toast.id)">
                <font-awesome icon="times" aria-hidden="true" />
            </button>
        </div>
    </TransitionGroup>
</template>

<style scoped>
.toast-region {
    position: fixed;
    right: var(--space-5);
    bottom: var(--space-5);
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: min(420px, calc(100vw - 2 * var(--space-5)));
    pointer-events: none;
}

.toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    background: white;
    border: 1px solid var(--cinza-medio);
    border-left-width: 4px;
    border-radius: var(--radius-md);
    box-shadow: var(--boxshadow-regular);
}

.toast-error {
    border-left-color: #ef4444;
}

.toast-success {
    border-left-color: #22c55e;
}

.toast-warning {
    border-left-color: #eab308;
}

.toast-info {
    border-left-color: #3b82f6;
}

.toast-message {
    white-space: pre-line;
    font-size: 0.95rem;
    color: var(--preto);
}

.toast-close {
    color: var(--cinza);
}
</style>
