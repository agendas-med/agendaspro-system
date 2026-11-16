<template>
    <nav aria-label="Menu principal">
        <div class="nav-group" v-for="section in sections" :key="section.id">
            <p class="fontsize-sm" :id="'nav-' + section.id">{{ section.label }}</p>
            <ul :aria-labelledby="'nav-' + section.id">
                <li class="fontsize-md sidebar-text" v-for="entry in section.items" :key="entry.id">
                    <router-link :to="entry.to" :class="{ 'is-active': isActive(entry) }"
                        :aria-current="isActive(entry) ? 'page' : null" @click.native="$emit('closeSidebar')">
                        <font-awesome :icon="entry.icon" class="sidebar-icons" />{{ entry.label }}
                    </router-link>
                </li>
            </ul>
        </div>
    </nav>
</template>
<script>
import { buildNavSections, isNavActive } from '../../utils/nav.js';

export default {
    emits: ["closeSidebar"],
    computed: {
        // "Integrações" só aparece se o core oferecer ao menos uma delas (core sem a F6 = recurso escondido).
        integrationsAvailable() {
            return this.$instagram.state.available === "yes" || this.$googleCalendar.state.available === "yes";
        },
        sections() {
            return buildNavSections({
                isAdmin: !!this.$myFunctions.hasPermission(this),
                assistantEnabled: this.$assistant.state.status === "enabled",
                integrationsAvailable: this.integrationsAvailable
            });
        }
    },
    methods: {
        isActive(entry) {
            return isNavActive(entry, this.$route.path);
        }
    },
    mounted() {
        // O item "Assistente" só aparece se o core responder que o recurso está ligado (falha = continua escondido).
        this.$assistant.probe();
        this.$instagram.loadStatus();
        this.$googleCalendar.loadStatus();
    }
}
</script>
<style scoped>
    .nav-group {
        margin-bottom: var(--space-8);
    }

        .nav-group p {
            color: var(--azul);
            margin-left: var(--space-6);
        }

    ul li {
        border-radius: var(--radius-md);
        cursor: pointer;
        margin: var(--space-2) 0;
        transition: background 0.4s;
    }   

        ul li a {
            padding: var(--space-3);
            padding-left: var(--space-6);
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            border-radius: var(--radius-md);
        }

        ul li:hover {
            background: var(--verde-escuro);
        }

        ul li:hover, ul li:hover .sidebar-icons {
            color: var(--branco);
        }

        /* Rota atual: mesmo destaque do hover (sem estilo novo), mais o texto em negrito para não depender só da cor. */
        ul li a.is-active {
            background: var(--verde-escuro);
            color: var(--branco);
            font-weight: 700;
        }

        ul li a.is-active .sidebar-icons {
            color: var(--branco);
        }

        /* Alvo de toque de 44px no menu em gaveta (celular/tablet). */
        @media (max-width: 1029px) {
            ul li a {
                min-height: 44px;
            }
        }
</style>
