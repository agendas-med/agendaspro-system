<template>
    <form id="informations-form" @submit.prevent="saveCustomer()" :invalid="invalidForm">
        <div class="edit-event grid grid-cols-1 gap-4">
            <div class="input-group">
                <label for="name">Nome</label>
                <input type="text" id="name" required v-model="customer.name">
            </div>
            <div class="input-group">
                <label for="cpf">CPF <span class="optional">(opcional)</span></label>
                <input type="text" id="cpf" v-model="customer.cpf" inputmode="numeric" autocomplete="off"
                    @input="$myFunctions.formatCpfInput($event, customer.cpf)">
            </div>
            <div class="input-group">
                <label for="email">E-mail</label>
                <input type="email" id="email" v-model="customer.email" placeholder="cliente@email.com">
            </div>
            <div class="input-group">
                <label for="birthday">Data de nascimento <span class="optional">(opcional)</span></label>
                <input type="date" id="birthday" v-model="customer.birthday">
            </div>
            <div class="input-group">
                <label for="tel">Telefone</label>
                <input type="text" id="tel" required v-model="customer.tel"
                    @input="$myFunctions.formatTelInput($event, customer.tel)">
            </div>
            <div class="input-group">
                <label for="customer-photo">Foto de perfil</label>
                <div class="flex items-center mt-2">
                    <img :src="customer.image != undefined ? $myFunctions.fileUrl(customer.image) : defaultUserImage" class="avatar avatar-g" alt="">
                    <input type="file" id="customer-photo" @change="onFileChange" accept="image/*">
                </div>
            </div>
        </div>
        <input type="submit" id="submit-button" />
    </form>

</template>
<script>
import defaultUserImage from '@/assets/img/default-user-image.png';

export default {
    emits: ["savedContent"],
    data() {
        return {
            invalidForm: true,
            defaultUserImage: defaultUserImage
        }
    },
    computed: {
        customer: function () {
            let customer = this.$global.contentObject;
            customer.birthday = this.$myFunctions.formatDateFromDB(customer.birthday || "");
            customer.cpf = this.$myFunctions.formatCpfFromDB(customer.cpf || "");

            return reactive(customer);
        }
    },
    methods: {
        saveCustomer() {
            let self = this;
            
            let payload = { ...self.customer };

            if (payload.tel) {
                payload.tel = payload.tel.replace(/\D/g, ""); 
                
                if (payload.tel.startsWith("55") && payload.tel.length > 11) {
                    payload.tel = payload.tel.substring(2);
                }
            }

            // CPF e data de nascimento são opcionais: sem valor, cpf sai do payload e birthday vai null.
            payload.cpf = payload.cpf ? String(payload.cpf).replace(/\D/g, "") : "";
            if (!payload.cpf) delete payload.cpf;

            if (!payload.birthday) payload.birthday = null;

            delete payload.last_appointment;
            delete payload.created_at;
            delete payload.updated_at;

            if (self.customer.id) {
                self.$base.api.patch("/customers/" + self.customer.id, payload)
                    .then(function () {
                        self.$emit("savedContent");
                        self.$myFunctions.showFeedbackModal(self, "Sucesso", "Cliente atualizado com sucesso.", "success");
                    })
                    .catch(function (error) {
                        self.$myFunctions.stopModalLoading(self);
                        self.$myFunctions.showFeedbackModal(self, "Erro", self.$myFunctions.errorMessage(error, "Ocorreu um erro ao atualizar o cliente."), "error");
                    });
            } else {
                self.$base.api.post("/customers", payload) 
                    .then(function () {
                        self.$emit("savedContent");
                        self.$myFunctions.showFeedbackModal(self, "Sucesso", "Cliente cadastrado com sucesso.", "success");
                    })
                    .catch(function (error) {
                        self.$myFunctions.stopModalLoading(self);
                        self.$myFunctions.showFeedbackModal(self, "Erro", self.$myFunctions.errorMessage(error, "Ocorreu um erro ao cadastrar o cliente."), "error");
                    });
            }
        },
        onFileChange(event) {
            const file = event.target.files[0];

            if (file && file.type.startsWith("image/")) {
                const reader = new FileReader();

                reader.onload = (e) => {
                    this.customer.image = e.target.result;
                };

                reader.readAsDataURL(file);
            }
        },
    },
    mounted: function () {
        $("#name").focus();
        if (this.customer.tel != undefined) {
            $("#tel").val(this.$myFunctions.formatTel(this.customer.tel));
        }
    }
}
</script>
<style scoped></style>