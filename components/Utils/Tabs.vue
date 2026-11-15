<template>
    <div class="system-tabs flex items-center flex-wrap" role="tablist" @keydown.right.prevent="moveTab(1)"
        @keydown.left.prevent="moveTab(-1)">
        <button type="button" role="tab" class="tab cinza fontsize-md" v-for="(tab, index) in tabs" :key="tab.name"
            :class="tabActive == index ? 'active' : ''" :aria-selected="tabActive == index ? 'true' : 'false'"
            :tabindex="tabActive == index ? 0 : -1" v-on:click="selectTab(index)" ref="tabs">
            <span class="tab-inner flex items-center">
                <span>{{ tab.name }}</span>
                <span class="tab-number fontsize-sm" v-if="tab.quantity != null">{{ tab.quantity }}</span>
            </span>
        </button>
        <div class="tabs-indicator" :style="indicatorStyle"></div>
    </div>
</template>
<script>
export default {
    emits: ["changedTab"],
    props: ['tabs'],
    data() {
        return {
            tabActive: null,
            indicatorStyle: {
                width: '0px',
                left: '0px'
            }
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
                        width: `${tabWidth}px`,
                        left: `${tabLeft}px`
                    };
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
    transition: color 0.4s;
}

.active {
    color: var(--verde-escuro);
}

.tab-number {
    margin-left: var(--space-3);
    padding: 0 var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--cinza-claro); 
}

.tabs-indicator {
    position: absolute;
    bottom: 0;
    height: 3px;
    background-color: var(--verde-escuro); /* Cor do indicador */
    transition: all 0.4s;
}
</style>