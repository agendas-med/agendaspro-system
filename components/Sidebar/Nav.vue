<template>
    <nav aria-label="Menu principal">
        <div class="nav-group" v-for="section in sections" :key="section.id">
            <p class="fontsize-sm" :id="'nav-' + section.id">{{ section.label }}</p>
            <ul :aria-labelledby="'nav-' + section.id">
                <li class="fontsize-md sidebar-text" v-for="entry in section.items" :key="entry.id">
                    <router-link :to="entry.to" :class="{ 'is-active': isActive(entry) }"
                        :aria-current="isActive(entry) ? 'page' : null" @click.native="$emit('closeSidebar')">
                        <font-awesome :icon="entry.icon" class="sidebar-icons" />{{ entry.label }}
                        <template v-if="entry.badge === 'whatsapp' && waitingText">
                            <span class="nav-badge m-pulse-soft fontsize-sm" aria-hidden="true">{{ waitingText }}</span>
                            <span class="sr-only">, {{ waitingLabel }}</span>
                        </template>
                    </router-link>
                </li>
            </ul>
        </div>
    </nav>
</template>
<script>
import { buildNavSections, hasNavBadge, isNavActive } from '../../utils/nav.js';
import { badgeLabel, badgeText, waitingCount } from '../../utils/whatsappBadge.js';

export default {
    emits: ["closeSidebar"],
    computed: {
        // "Integrações" só aparece se o core oferecer ao menos uma delas (core sem a F6 = recurso escondido).
        integrationsAvailable() {
            return this.$instagram.state.available === "yes" || this.$googleCalendar.state.available === "yes";
        },
        showWhatsappBadge() {
            return hasNavBadge(this.sections, "whatsapp");
        },
        waiting() {
            return waitingCount(this.$whatsappBadge.state.summary);
        },
        waitingText() {
            return badgeText(this.waiting);
        },
        waitingLabel() {
            return badgeLabel(this.waiting);
        },
        sections() {
            return buildNavSections({
                isAdmin: !!this.$myFunctions.hasPermission(this),
                assistantEnabled: this.$assistant.state.status === "enabled",
                integrationsAvailable: this.integrationsAvailable
            });
        }
    },
    watch: {
        // Selo do WhatsApp: o polling só roda enquanto o item existe no menu (e o core diz que o WhatsApp está ligado).
        showWhatsappBadge: {
            immediate: true,
            handler(show) {
                if (show) this.$whatsappBadge.start();
                else this.$whatsappBadge.stop();
            }
        }
    },
    methods: {
        isActive(entry) {
            return isNavActive(entry, this.$route.path);
        }
    },
    beforeUnmount() {
        if (this.onVisibility) document.removeEventListener("visibilitychange", this.onVisibility);
        this.$whatsappBadge.stop();
    },
    mounted() {
        // Aba oculta pausa o polling do selo; voltar a ficar visível atualiza já.
        this.onVisibility = () => this.$whatsappBadge.notifyVisibility();
        document.addEventListener("visibilitychange", this.onVisibility);
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
        transition: background-color var(--motion-fast) var(--ease-standard);
    }

        ul li a {
            padding: var(--space-3);
            padding-left: var(--space-6);
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            border-radius: var(--radius-md);
            position: relative;
            transition:
                background-color var(--motion-fast) var(--ease-standard),
                color var(--motion-fast) var(--ease-standard);
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

        /* Indicador do item ativo: barra que cresce (scaleY) na borda esquerda quando a rota passa a ser a atual. */
        ul li a.is-active::before {
            content: "";
            position: absolute;
            left: var(--space-1);
            top: 25%;
            height: 50%;
            width: 3px;
            border-radius: var(--radius-xs);
            background: var(--branco);
            transform-origin: center;
            animation: m-nav-indicator var(--motion-base) var(--ease-out) both;
        }

        @keyframes m-nav-indicator {
            from {
                opacity: 0;
                transform: scaleY(0);
            }

            to {
                opacity: 1;
                transform: scaleY(1);
            }
        }

        /* Selo "aguardando atendimento": mesmo amarelo da etiqueta "Aguardando atendente" (legível sobre o hover e o ativo). */
        .nav-badge {
            margin-left: auto;
            min-width: 24px;
            padding: 0 var(--space-3);
            border-radius: var(--radius-lg);
            background: var(--amarelo);
            color: var(--preto);
            font-weight: 700;
            text-align: center;
            line-height: 24px;
        }

        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
        }

        /* Alvo de toque de 44px no menu em gaveta (celular/tablet). */
        @media (max-width: 1029px) {
            ul li a {
                min-height: 44px;
            }
        }
</style>
