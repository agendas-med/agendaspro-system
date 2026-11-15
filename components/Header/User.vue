<template>
    <div class="header-user">
        <button type="button" class="user-container flex items-center" aria-haspopup="menu"
            :aria-expanded="dropdownOpened ? 'true' : 'false'" aria-controls="user-menu" aria-label="Menu do usuário"
            v-on:click="toggleDropdown()" v-on:keydown.esc="closeDropdown()">
            <img :src="$global.user.url_photo || defaultUserImage" alt="" class="avatar avatar-pp">
            <span class="informacoes-usuario">
                <span class="fontsize-md preto">{{ $global.user.name }}</span>
            </span>
            <font-awesome icon="angle-down" class="dropdown-button cinza" aria-hidden="true"
                :class="dropdownOpened ? 'rotated' : ''" />
        </button>
        <transition name="fade">
            <div v-if="dropdownOpened" id="user-menu" class="user-dropdown" role="menu" v-on:keydown.esc="closeDropdown()">
                <ul>
                <li role="none" v-on:click="toggleDropdown()">
                    <nuxt-link to="/perfil" role="menuitem">
                        Meu perfil
                    </nuxt-link>
                </li>
                <li role="none"><button type="button" role="menuitem" v-on:click="changeCompany()">Trocar de empresa</button></li>
                <li role="none"><button type="button" role="menuitem" v-on:click="logout()">Sair</button></li>
                </ul>
            </div>
        </transition>   
        <div class="dropdown-wrapper" v-show="dropdownOpened" aria-hidden="true" v-on:click="closeDropdown()"></div>
    </div>
</template>
<script>
import defaultUserImage from '@/assets/img/default-user-image.png';
export default {
    data() {
        return {
            defaultUserImage,
            dropdownOpened: false
        }
    },
    methods: {
        logout: function () {
            this.toggleDropdown();
            this.$myFunctions.logoutUser();
        },
        toggleDropdown: function () {
            this.dropdownOpened = !this.dropdownOpened;
        },
        closeDropdown: function () {
            this.dropdownOpened = false;
        },
        changeCompany: function () {
            this.closeDropdown();
            this.$router.push("/trocar-empresa");
        }
    }
}
</script>
<style scoped>
.header-user {
    cursor: pointer;
    position: relative;
}

.informacoes-usuario {
    margin-right: var(--space-3);
}

.user-dropdown {
    width: fit-content;
    height: fit-content;
    background: var(--branco);
    border-radius: var(--radius-md);
    border: 1px solid var(--cinza-medio);
    box-shadow: var(--boxshadow-regular);
    position: absolute;
    top: 110%;
    z-index: 5;
    right: 0;
    white-space: nowrap;
}

.user-container {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    cursor: pointer;
}

li {
    padding: var(--space-3) var(--space-6);
    transition: background 0.4s;
}

li button {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    width: 100%;
    text-align: left;
}

    li:hover {
        background: var(--cinza-medio);
    }

.dropdown-wrapper {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 4;
    cursor: default
}

.dropdown-button {
    transition: transform 0.4s;
}

.rotated {
    transform: rotate(-180deg);
}
</style>
