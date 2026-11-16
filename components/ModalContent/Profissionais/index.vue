<template>
    <form id="informations-form" @submit.prevent="saveProfessional()">
        <div class="grid grid-cols-1 gap-4">
            <div class="input-group">
                <label for="professional-name">Nome</label>
                <input type="text" id="professional-name" required minlength="2" maxlength="120" v-model="form.name">
            </div>
            <div class="input-group">
                <label for="professional-email">E-mail <span class="optional">(opcional)</span></label>
                <input type="email" id="professional-email" maxlength="255" v-model="form.email">
            </div>
            <div class="input-group">
                <label for="professional-phone">Telefone <span class="optional">(opcional)</span></label>
                <input type="tel" id="professional-phone" pattern="[\d\s()+\-]{8,20}" maxlength="20"
                    title="Use de 8 a 20 caracteres: números, espaços, parênteses, + ou -." v-model="form.phone">
            </div>
            <div class="input-group">
                <label for="professional-color">Cor na agenda</label>
                <div class="color-row">
                    <input type="color" id="professional-color" v-model="form.color" aria-describedby="color-help">
                    <span class="fontsize-sm cinza" id="color-help">Identifica os atendimentos deste profissional.</span>
                </div>
            </div>

            <fieldset class="input-group services-group" v-if="services.length">
                <legend>Serviços atendidos</legend>
                <p class="fontsize-sm cinza">Sem seleção, o profissional não aparece para nenhum serviço específico.</p>
                <div class="input-checkbox-group" v-for="service in services" :key="service.id">
                    <label :for="'service-' + service.id">{{ service.name }}</label>
                    <input type="checkbox" :id="'service-' + service.id" :value="service.id" v-model="form.service_ids">
                </div>
            </fieldset>
            <p class="fontsize-sm cinza" v-else>Cadastre serviços em Configurações para vinculá-los ao profissional.</p>

            <div class="input-checkbox-group" v-if="isEdit">
                <label for="professional-active">Ativo (aparece na agenda e aceita novos agendamentos)</label>
                <input type="checkbox" id="professional-active" v-model="form.active">
            </div>
        </div>
        <input type="submit" id="submit-button" />
    </form>
</template>

<script>
import { buildProfessionalPayload, unwrap, DEFAULT_PROFESSIONAL_COLOR } from '../../../utils/payloads.js';

export default {
    emits: ["savedContent"],
    data() {
        const current = this.$global.contentObject || { id: 0 };
        const isEdit = current.id != 0;
        return {
            isEdit,
            form: {
                id: current.id || 0,
                name: isEdit ? current.name || "" : "",
                email: isEdit ? current.email || "" : "",
                phone: isEdit ? current.phone || "" : "",
                color: isEdit && /^#[0-9a-fA-F]{6}$/.test(current.color || "") ? current.color : DEFAULT_PROFESSIONAL_COLOR,
                service_ids: isEdit && Array.isArray(current.service_ids) ? [...current.service_ids] : [],
                active: isEdit ? current.active !== false : true
            }
        }
    },
    computed: {
        services() {
            return this.$global.company.services || [];
        }
    },
    mounted() {
        document.getElementById("professional-name")?.focus();
    },
    methods: {
        saveProfessional() {
            const payload = buildProfessionalPayload(this.form, { isEdit: this.isEdit });
            const request = this.isEdit
                ? this.$base.api.patch("/professionals/" + this.form.id, payload)
                : this.$base.api.post("/professionals", payload);

            request.then(() => {
                this.$emit("savedContent");
                this.$myFunctions.showFeedbackModal(this, "Sucesso", "Profissional salvo com sucesso.", "success");
            }).catch((error) => {
                this.$myFunctions.stopModalLoading(this);
                // 402 (limite do plano) abre o modal global de upgrade; o aviso de erro duplicado é suprimido.
                this.$myFunctions.showFeedbackModal(this, "Erro", this.$myFunctions.errorMessage(error, "Não foi possível salvar o profissional."), "error");
            });
        }
    }
}
</script>

<style scoped>
.color-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
}

.color-row input[type="color"] {
    width: 56px;
    height: 44px;
    padding: 2px;
    cursor: pointer;
}

.services-group {
    border: 0;
    padding: 0;
}

.services-group legend {
    margin-bottom: var(--space-2);
}
</style>
