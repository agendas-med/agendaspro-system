<template>
  <Transition name="modal">
    <div class="upgrade-overlay flex items-center justify-center" v-if="$global.upgradePrompt.show">
        <div class="upgrade-wrapper" v-on:click="close()"></div>
        <div class="upgrade-container m-panel" ref="dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="upgrade-title" aria-describedby="upgrade-message" tabindex="-1">
            <div class="upgrade-body">
                <h2 class="fontsize-lg-bold preto" id="upgrade-title">Faça upgrade para continuar</h2>
                <p class="fontsize-md cinza mt-2" id="upgrade-message">{{ info.message }}</p>
                <p class="fontsize-md preto mt-2" v-if="quotaText">{{ quotaText }}</p>
                <p class="fontsize-sm cinza mt-2" v-if="!isAdmin">
                    Peça ao administrador da empresa para mudar de plano.
                </p>
            </div>
            <div class="upgrade-footer">
                <button type="button" class="btn btn-cinza" v-on:click="close()">Agora não</button>
                <button type="button" class="btn btn-primary" v-if="isAdmin" v-on:click="goToPlans()">Ver planos</button>
            </div>
        </div>
    </div>
  </Transition>
</template>

<script>
import { dialogA11y } from '../../utils/dialogA11y.js';
import { describeQuota } from '../../utils/planErrors.js';

// Modal global de upgrade, aberto pelo interceptor em 402 plan_upgrade_required (montado em app.vue).
export default {
    mixins: [dialogA11y],
    computed: {
        info() {
            return this.$global.upgradePrompt.info || { message: '' };
        },
        quotaText() {
            return describeQuota(this.$global.upgradePrompt.info);
        },
        isAdmin() {
            return this.$myFunctions.hasPermission(this);
        }
    },
    watch: {
        "$global.upgradePrompt.show": function (show) {
            if (show) {
                this.$nextTick(() => {
                    this.activateDialog(this.$refs.dialog, () => this.close());
                    const cancel = this.$refs.dialog && this.$refs.dialog.querySelector('.btn-cinza');
                    if (cancel) cancel.focus();
                });
            } else {
                this.deactivateDialog();
            }
        }
    },
    methods: {
        close() {
            this.$global.upgradePrompt.show = false;
            this.$global.upgradePrompt.info = null;
        },
        goToPlans() {
            this.close();
            this.$router.push('/billing/plano');
        }
    }
}
</script>

<style scoped>
.upgrade-overlay,
.upgrade-wrapper {
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
}

/* Acima do modal padrão (2-4), do feedback e da confirmação (30-31). */
.upgrade-overlay {
    z-index: 40;
}

.upgrade-wrapper {
    background-color: rgba(0, 0, 0, 0.6);
}

.upgrade-container {
    position: relative;
    z-index: 41;
    width: 90vw;
    max-width: 440px;
    background: white;
    border-radius: var(--radius-lg);
    border: 1px solid var(--cinza-medio);
}

.upgrade-body {
    padding: var(--space-5);
}

.upgrade-footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-5);
    border-top: 1px solid var(--cinza-medio);
}

.upgrade-footer .btn {
    max-width: none;
}
</style>
