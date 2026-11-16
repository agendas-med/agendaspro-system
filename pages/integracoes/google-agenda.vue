<template>
    <div class="gc-page">
        <IntegrationsNotice :notice="state.notice" v-on:dismiss="$googleCalendar.clearNotice()" />

        <GoogleCalendarConnectionCard v-on:disconnect="dialogOpen = true" />

        <template v-if="connected">
            <GoogleCalendarLinks />
            <GoogleCalendarBlocks v-if="hasBusyLink" />
        </template>

        <GoogleCalendarDisconnectDialog :open="dialogOpen" :links="state.links" v-on:cancel="dialogOpen = false" v-on:confirm="disconnect($event)" />
    </div>
</template>

<script>
export default {
    data() {
        return { dialogOpen: false };
    },
    computed: {
        state() { return this.$googleCalendar.state; },
        view() { return this.$googleCalendar.view(); },
        connected() { return this.view === 'connected' || this.view === 'reauth_required'; },
        hasBusyLink() { return this.state.links.some((l) => l.role === 'busy'); }
    },
    mounted() {
        this.$googleCalendar.load();
    },
    methods: {
        async disconnect({ removeAppCalendars }) {
            this.dialogOpen = false;
            await this.$googleCalendar.disconnect({ removeAppCalendars });
        }
    }
}
</script>

<script setup>
definePageMeta({ access: 'member', title: 'Google Agenda' })
</script>
