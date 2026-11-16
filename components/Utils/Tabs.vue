<template>
    <div class="system-tabs flex items-center flex-wrap" role="tablist" @keydown.right.prevent="moveTab(1)"
        @keydown.left.prevent="moveTab(-1)">
        <button type="button" role="tab" class="tab cinza fontsize-md" v-for="(tab, index) in tabs" :key="tab.name"
            :class="tabActive == index ? 'active' : ''" :aria-selected="tabActive == index ? 'true' : 'false'"
            :tabindex="tabActive == index ? 0 : -1" v-on:click="selectTab(index)" ref="tabs">
            <span class="tab-inner flex items-center">
                <span>{{ tab.name }}</span>
                <span class="tab-number fontsize-sm" v-if="tab.quantity != null" :aria-hidden="tab.srLabel ? 'true' : null">{{ tab.quantity }}</span>
                <span class="tab-sr-only" v-if="tab.quantity != null && tab.srLabel">, {{ tab.srLabel }}</span>
            </span>
        </button>
        <div class="tabs-indicator" :class="{ 'is-instant': !indicatorReady }" :style="indicatorStyle" aria-hidden="true"></div>
    </div>
</template>
<script>
export default {
    emits: ["changedTab"],
    props: ['tabs'],
    data() {
        return {
            tabActive: null,
            // Indicador deslizante: 1px de largura esticado por scaleX e levado por translateX (só transform).
            indicatorReady: false,
            indicatorStyle: {
                transform: 'translateX(0px) scaleX(0)'
            }
        }
    },
    watch: {
        // A largura da aba muda quando aparece/some o número (ex.: selo de conversas aguardando).
        tabs: {
            deep: true,
            handler() { this.updateIndicator(); }
        }
    },
    methods: {
        selectTab(index) {
            this.tabActive = index;
            this.updateIndicator();
            this.$emit("changedTab", index);
        },
        moveTab(step) {
            const total = this.tabs.length;
            if (!total) return;
            const next = (this.tabActive + step + total) % total;
            this.selectTab(next);
            this.$nextTick(() => {
                const el = this.$refs.tabs && this.$refs.tabs[next];
                if (el) el.focus();
            });
        },
        updateIndicator() {
            this.$nextTick(() => {
                const activeTab = this.$refs.tabs[this.tabActive];
                
                if (activeTab) {
                    const tabWidth = activeTab.offsetWidth;
                    const tabLeft = activeTab.offsetLeft;

                    this.indicatorStyle = {
                        transform: `translateX(${tabLeft}px) scaleX(${tabWidth})`
                    };
                    // A primeira posição é direta (sem deslizar desde o canto); as seguintes animam.
                    if (!this.indicatorReady) requestAnimationFrame(() => { this.indicatorReady = true; });
                }
            });
        }
    },
    mounted: function () {
        for (let i = 0; i < this.tabs.length; i++) {
            let currentTab = this.tabs[i];

            if (currentTab.default) {
                this.tabActive = i;
            }
        }

        this.selectTab(this.tabActive);
        this.updateIndicator();
    }
}
</script>
<style scoped>
.system-tabs {
    margin: var(--space-6) 0;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--cinza-medio);
    width: 100%;
    position: relative;
}

.tab {
    background: none;
    border: 0;
    border-radius: 0;
    font: inherit;
    margin-right: var(--space-6);
    cursor: pointer;
    padding-bottom: var(--space-4);
    position: relative;
    transition: color var(--motion-fast) var(--ease-standard);
}

.tab:hover:not(.active) {
    color: var(--preto);
}

.active {
    color: var(--verde-escuro);
}

.tab-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

.tab-number {
    margin-left: var(--space-3);
    padding: 0 var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--cinza-claro); 
}

/* Alvo de toque de 44px em telas pequenas. */
@media (max-width: 768px) {
    .tab {
        min-height: 44px;
    }
}

.tabs-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 1px;
    height: 3px;
    transform-origin: left center;
    background-color: var(--verde-escuro); /* Cor do indicador */
    transition: transform var(--motion-base) var(--ease-out);
}

.tabs-indicator.is-instant {
    transition: none;
}
</style>