<template>
    <div class="modal flex items-center justify-center" v-if="$global.modalUtils.feedback.show"
        :class="showModal ? 'show' : ''">
        <div class="modal-wrapper" v-on:click="closeFeedback()"></div>
        <div class="modal-container" ref="dialog" role="alertdialog" aria-modal="true" aria-labelledby="feedback-title"
            aria-describedby="feedback-message" tabindex="-1">

            <div class="modal-header flex justify-between items-center border-b border-gray-200 pb-3">
                <p class="fontsize-lg-bold preto m-0" id="feedback-title">{{ $global.modalUtils.feedback.title }}</p>
                <button type="button" class="icon-btn cinza" aria-label="Fechar" v-on:click="closeFeedback()">
                    <font-awesome icon="times" aria-hidden="true" />
                </button>
            </div>

            <div class="modal-body flex flex-col items-center justify-center py-6">
                <font-awesome v-if="type === 'success'" icon="circle-check" class="feedback-icon text-green-500 mb-4" />
                <font-awesome v-if="type === 'error'" icon="circle-xmark" class="feedback-icon text-red-500 mb-4" />
                <font-awesome v-if="type === 'warning'" icon="triangle-exclamation"
                    class="feedback-icon text-yellow-500 mb-4" />

                <p class="fontsize-md cinza text-center m-0 feedback-message" id="feedback-message">{{ $global.modalUtils.feedback.message }}</p>
            </div>

            <div class="modal-footer flex justify-end border-t border-gray-200 pt-3">
                <button type="button" class="btn btn-primary px-8" v-on:click="closeFeedback()">OK</button>
            </div>

        </div>
    </div>
</template>

<script>
import { dialogA11y } from '../../utils/dialogA11y.js';

export default {
    mixins: [dialogA11y],
    data() {
        return {
            showModal: false
        }
    },
    computed: {
        type() {
            return this.$global.modalUtils.feedback.type;
        }
    },
    watch: {
        "$global.modalUtils.feedback.show": function (val) {
            if (val) {
                setTimeout(() => { this.showModal = true; }, 50);
                this.$nextTick(() => this.activateDialog(this.$refs.dialog, () => this.closeFeedback()));
            } else {
                this.showModal = false;
                this.deactivateDialog();
            }
        },
        "$global.modalUtils.feedback.isClosing": function (isClosing) {
            if (isClosing) {
                this.showModal = false;
            }
        }
    },
    methods: {
        closeFeedback() {
            this.$myFunctions.closeFeedbackModal(this);
        }
    }
}
</script>

<style scoped>
.modal,
.modal-wrapper {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transition: opacity 0.4s;
    z-index: 20;
}

.modal-wrapper {
    background-color: rgba(0, 0, 0, 0.6);
    opacity: 0;
    z-index: 21;
}

.show .modal-container {
    transform: translateY(0);
    opacity: 1;
}

.show .modal-wrapper {
    opacity: 1;
}

.modal-container {
    transition: transform 0.4s, opacity 0.4s;
    transform: translateY(-20px);
    opacity: 0;
    z-index: 22;
    border-radius: var(--radius-lg);
    border: 1px solid var(--cinza-medio);
    background: white;
    display: flex;
    flex-direction: column;
    width: 90vw;
    max-width: 400px;
    height: auto;
    min-height: 280px;
}

.modal-header,
.modal-body,
.modal-footer {
    padding: var(--space-5);
}

.modal-footer button {
    width: 100%;
    max-width: 100%;
}

.feedback-message {
    white-space: pre-line;
}

.feedback-icon {
    font-size: 4rem;
}

.text-green-500 {
    color: #22c55e;
}

.text-red-500 {
    color: #ef4444;
}

.text-yellow-500 {
    color: #eab308;
}
</style>