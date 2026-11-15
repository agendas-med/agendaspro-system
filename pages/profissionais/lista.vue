<template>
    <section>
        <UtilsDataTable :loaded="!loading" :dataTable="professionals" :rowsPerPage="8" :newButton="true"
            table="profissional" :error="loadError" emptyText="Você ainda não cadastrou profissionais. Cadastre o primeiro para distribuir a agenda."
            @retry="load" @handleNew="newProfessional">
            <template #column-profissional="{ item }">
                <div class="flex items-center">
                    <span class="swatch" :style="{ background: item.color || '#999999' }" aria-hidden="true"></span>
                    <div>
                        <p><strong>{{ item.name }}</strong></p>
                        <p class="cinza" v-if="item.email">{{ item.email }}</p>
                    </div>
                </div>
            </template>
            <template #column-serviços="{ item }">
                <p>{{ servicesLabel(item) }}</p>
            </template>
            <template #column-status="{ item }">
                <p class="tag" :class="item.active ? 'green' : 'red'">{{ item.active ? "Ativo" : "Inativo" }}</p>
            </template>
            <template #column-ações="{ item }">
                <div class="flex space-x-2">
                    <button type="button" class="rounded-button" :aria-label="'Horários de ' + item.name"
                        :title="'Horários de ' + item.name" v-on:click="editSchedule(item)">
                        <font-awesome icon="clock" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" :aria-label="'Editar ' + item.name"
                        :title="'Editar ' + item.name" v-on:click="editProfessional(item)">
                        <font-awesome icon="user-pen" class="cinza" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" v-if="item.active" :aria-label="'Desativar ' + item.name"
                        :title="'Desativar ' + item.name" v-on:click="deactivate(item)">
                        <font-awesome icon="ban" class="vermelho" aria-hidden="true" />
                    </button>
                    <button type="button" class="rounded-button" v-else :aria-label="'Reativar ' + item.name"
                        :title="'Reativar ' + item.name" v-on:click="reactivate(item)">
                        <font-awesome icon="rotate-left" class="cinza" aria-hidden="true" />
                    </button>
                </div>
            </template>
        </UtilsDataTable>

        <UtilsModal @closeModal="$myFunctions.closeModal($.proxy); load()">
            <ModalContentProfissionais v-if="modalContentProfissionais"
                @savedContent="$myFunctions.closeModal($.proxy, []); load()" />
            <ModalContentProfissionaisHorarios v-if="modalContentProfissionaisHorarios"
                @savedContent="$myFunctions.closeModal($.proxy, []); load()" />
        </UtilsModal>
    </section>
</template>

<script>
import { unwrap } from '../../utils/payloads.js';

export default {
    data() {
        return {
            loading: true,
            loadError: "",
            professionals: [],
            modalContentProfissionais: false,
            modalContentProfissionaisHorarios: false
        }
    },
    mounted() {
        this.load();
    },
    methods: {
        load() {
            this.loadError = "";
            this.$base.api.get("/professionals", { params: { include_inactive: true } }).then((response) => {
                this.professionals = unwrap(response) || [];
            }).catch((error) => {
                this.loadError = this.$myFunctions.errorMessage(error, "Não foi possível carregar os profissionais.");
            }).then(() => {
                this.loading = false;
            });
        },
        servicesLabel(item) {
            const ids = item.service_ids || [];
            if (!ids.length) return "Nenhum serviço vinculado";
            const services = this.$global.company.services || [];
            const names = ids.map((id) => (services.find((s) => s.id === id) || {}).name).filter(Boolean);
            return names.length ? names.join(", ") : ids.length + (ids.length > 1 ? " serviços" : " serviço");
        },
        newProfessional() {
            this.$myFunctions.openModal({
                instance: this,
                title: "Cadastrar profissional",
                saveButton: "Cadastrar",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentProfissionais"
            });
        },
        editProfessional(item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Alterar profissional",
                saveButton: "Salvar",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentProfissionais",
                contentObject: item
            });
        },
        editSchedule(item) {
            this.$myFunctions.openModal({
                instance: this,
                title: "Horários de atendimento",
                saveButton: "Salvar horários",
                cancelButton: "Cancelar",
                modalContentVariable: "modalContentProfissionaisHorarios",
                contentObject: item
            });
        },
        async deactivate(item) {
            const ok = await this.$myFunctions.confirmDialog({
                title: "Desativar profissional",
                message: item.name + " deixa de aparecer na agenda e não recebe novos agendamentos. O histórico é mantido e você pode reativar depois.",
                confirmLabel: "Desativar",
                danger: true
            });
            if (!ok) return;
            try {
                await this.$base.api.delete("/professionals/" + item.id);
                this.$myFunctions.showToast(this, "Profissional desativado.", "success");
                this.load();
            } catch (error) {
                this.$myFunctions.notifyError(this, error, "Não foi possível desativar o profissional.");
            }
        },
        async reactivate(item) {
            try {
                await this.$base.api.patch("/professionals/" + item.id, { active: true });
                this.$myFunctions.showToast(this, "Profissional reativado.", "success");
                this.load();
            } catch (error) {
                // 402 (limite de profissionais do plano) abre o modal global de upgrade.
                this.$myFunctions.notifyError(this, error, "Não foi possível reativar o profissional.");
            }
        }
    }
}
</script>

<style scoped>
.swatch {
    display: inline-block;
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    margin-right: var(--space-4);
    border: 1px solid var(--cinza-medio);
}
</style>

<script setup>
definePageMeta({ access: 'admin', title: 'Profissionais' })
</script>
