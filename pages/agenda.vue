<template>
  <UtilsPageheader title="Agenda" subtitle="Organize seus horários e acompanhe seus agendamentos." />
  <div class="calendar-container">
    <div class="calendar-header flex justify-between">
      <div class="input-selecao-periodo" :style="responsive ? 'visibility: hidden;' : ''" :data-index="periodIndex"
        role="group" aria-label="Visualização da agenda">
        <button type="button" v-for="(period, index) in periods" :key="period.view" :aria-pressed="calendarType === period.view"
          :class="{ active: calendarType === period.view }" v-on:click="changePeriod(index)">{{ period.label }}</button>
        <div class="frame-botao" aria-hidden="true"></div>
      </div>
      <div class="navigation-buttons flex gap-1">
        <button type="button" class="btn btn-primary" v-on:click="goToday()" title="Ir para hoje">Hoje</button>
        <button type="button" class="btn btn-primary btn-square" v-on:click="goPrev()" title="Anterior" aria-label="Período anterior">
          <font-awesome icon="angle-left" aria-hidden="true" />
        </button>
        <button type="button" class="btn btn-primary btn-square" v-on:click="goNext()" title="Próximo" aria-label="Próximo período">
          <font-awesome icon="angle-right" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="professional-filter" v-if="professionals.length">
      <label for="professional-filter">Profissional</label>
      <select id="professional-filter" v-model="professionalFilter">
        <option value="all">Todos os profissionais</option>
        <option v-for="professional in professionals" :key="professional.id" :value="professional.id">
          {{ professional.name }}{{ professional.active ? "" : " (inativo)" }}
        </option>
        <option value="none">Sem profissional definido</option>
      </select>
    </div>
    <div class="legendas">
      <div class="pendente">Aguard. Pagamento</div>
      <div class="agendado">Agendado</div>
      <div class="iniciado">Iniciado</div>
      <div class="realizado">Realizado</div>
      <div class="cancelado">Cancelado</div>
    </div>
    <FullCalendar ref="fullCalendar" :options="calendarOptions" v-if="!reload && timezoneReady" />
    <UtilsModal @closeModal="$myFunctions.closeModal($.proxy, ['eventId'])">
      <ModalContentAgenda :event="selectedEvent" @savedContent="$myFunctions.closeModal($.proxy); getEvents(true);" />
    </UtilsModal>
  </div>

</template>
<script>
import FullCalendar from '@fullcalendar/vue3';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import momentTimezonePlugin from '@fullcalendar/moment-timezone';
import ptLocale from '@fullcalendar/core/locales/pt-br';
import { toBusinessHours } from '../utils/format.js';
import {
  unwrap, professionalsById, filterEventsByProfessional, buildAppointmentPayload, DEFAULT_TIMEZONE,
  wallClock, wallMinutesBetween, presetProfessionalId, normalizeAppointmentEvent, eventOverlapsRange,
} from '../utils/payloads.js';

const PERIODS = [
  { view: "dayGridMonth", label: "Mensal" },
  { view: "timeGridWeek", label: "Semanal" },
  { view: "timeGridDay", label: "Diário" }
];

export default {
  components: {
    FullCalendar
  },
  data() {
    return {
      periods: PERIODS,
      calendarType: "dayGridMonth",
      reload: false,
      calendarApi: null,
      calendarEvents: [],
      rawEvents: [],
      range: null,
      lastRangeKey: "",
      requestSeq: 0,
      draggingEventId: "",
      eventId: "",
      responsive: false,
      professionals: [],
      professionalFilter: "all",
      timezone: DEFAULT_TIMEZONE,
      timezoneReady: false,
      selectedEvent: {
        customer_id: null,
        customer_name: "",
        services: [],
        date: "",
        duration: "",
        observations: ""
      }
    }
  },
  computed: {
    periodIndex: function () {
      const index = PERIODS.findIndex((period) => period.view === this.calendarType);
      return index < 0 ? 0 : index;
    },
    businessHours: function () {
      const company = this.$global && this.$global.company;
      const hours = company && company.id ? toBusinessHours(company.configurations && company.configurations.opening_hours) : [];

      // false = sem faixa destacada (empresa sem horário de funcionamento configurado).
      return hours.length ? hours : false;
    },
    calendarOptions: function () {
      return {
        plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin, momentTimezonePlugin, listPlugin],
        locale: ptLocale,
        initialView: this.calendarType,
        initialDate: this._focusDate || undefined,
        dateClick: this.handleDateClick,
        viewDidMount: this.getApi,
        datesSet: this.handleDatesSet,
        events: this.calendarEvents,
        nowIndicator: true,
        dayMaxEventRows: true,
        timeZone: this.timezone,
        eventClick: this.eventClick,
        height: "calc(100vh - 218px)",
        editable: true,
        eventDrop: this.handleEventDrop,
        eventResize: this.handleEventResize,
        businessHours: this.businessHours,
        scrollTime: "07:00:00",
        titleFormat: {
          hour12: false,
          omitZeroMinute: false,
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        },
        headerToolbar: {
          start: 'title',
          center: '',
          end: ''
        }
      }
    }
  },
  watch: {
    professionalFilter: function () {
      this.applyEvents();
    }
  },
  mounted: function () {
    this.loadProfessionals();
    this.loadTimezone();

    // Só recria o calendário no boot se for tela pequena (visão em lista); caso contrário usa o padrão.
    if (window.innerWidth < 480) this.resizeCalendar(true);

    window.addEventListener("resize", this.resizeCalendar);
  },
  beforeUnmount: function () {
    window.removeEventListener("resize", this.resizeCalendar);
  },
  methods: {
    // Fuso da empresa (GET /companies/timezone). Falhou? Usa o padrão e segue: a agenda não pode ficar bloqueada.
    loadTimezone: function () {
      this.$base.api.get("/companies/timezone").then((response) => {
        const data = response.data.returnObj || {};
        this.timezone = data.effective || data.timezone || DEFAULT_TIMEZONE;
      }).catch(() => {
        this.timezone = DEFAULT_TIMEZONE;
      }).then(() => {
        this.timezoneReady = true;
      });
    },
    loadProfessionals: function () {
      this.$base.api.get("/professionals", { params: { include_inactive: true } }).then((response) => {
        this.professionals = unwrap(response) || [];
        this.applyEvents();
      }).catch(() => {
        this.professionals = [];
      });
    },
    goToday: function () {
      if (this.calendarApi) this.calendarApi.today();
    },
    goPrev: function () {
      if (this.calendarApi) this.calendarApi.prev();
    },
    goNext: function () {
      if (this.calendarApi) this.calendarApi.next();
    },
    // Disparado pelo FullCalendar a cada mudança do intervalo visível (inclusive na montagem).
    handleDatesSet: function (info) {
      this.range = { start: info.startStr, end: info.endStr };
      this.getEvents();
    },
    // Busca só o intervalo visível. Com `force` ignora a chave do último intervalo carregado.
    getEvents: function (force = false) {
      if (!this.range) return Promise.resolve();

      const key = this.range.start + "|" + this.range.end;
      if (!force && key === this.lastRangeKey) return Promise.resolve();

      this.lastRangeKey = key;
      const seq = ++this.requestSeq;
      const range = this.range;

      // O core atual ignora start/end e devolve tudo; o filtro abaixo garante o mesmo resultado nos dois casos.
      return this.$base.api.get("/appointments", { params: { start: range.start, end: range.end } })
        .then((response) => {
          if (seq !== this.requestSeq) return; // resposta de um intervalo antigo

          this.rawEvents = response.data.returnObj || [];
          this.applyEvents();
        })
        .catch((error) => {
          if (seq === this.requestSeq) this.lastRangeKey = ""; // permite tentar de novo
          this.$myFunctions.notifyError(this, error, "Não foi possível carregar os agendamentos");
        });
    },
    // Recalcula os eventos do calendário a partir do que foi carregado (intervalo + filtro de profissional).
    // O core ainda não filtra por profissional no GET /appointments: o filtro é feito aqui.
    applyEvents: function () {
      const range = this.range;
      if (!range) return;

      // O core serializa a hora de parede como ISO com "Z" (parede + 3h): normaliza uma vez para a parede
      // da empresa, que o calendário (timeZone nomeado), o modal e o PATCH usam sem nova conversão.
      const normalized = this.rawEvents.map(normalizeAppointmentEvent);
      const visible = normalized.filter((event) => eventOverlapsRange(event, range));
      const filtered = filterEventsByProfessional(visible, this.professionalFilter);
      const byId = professionalsById(this.professionals);

      this.calendarEvents = filtered.map((event) => this.decorateEvent(event, byId));
    },
    decorateEvent: function (event, professionalsMap = {}) {
      let statusColor = "var(--verde)";
      if (event.status === "pendente_pagamento") {
        statusColor = "#f97316";
      } else if (event.status === "agendado") {
        statusColor = "var(--amarelo)";
      } else if (event.status === "iniciado") {
        statusColor = "var(--azul)";
      } else if (event.status === "cancelado") {
        statusColor = "var(--vermelho)";
      }

      event["displayEventEnd"] = true;
      event["color"] = statusColor;

      // A cor do status continua no fundo; a cor do profissional marca a borda e o nome entra no título.
      const professional = event.professional_id != null ? professionalsMap[event.professional_id] : null;
      if (professional) {
        if (/^#[0-9a-fA-F]{6}$/.test(professional.color || "")) event["borderColor"] = professional.color;
        event["professional_name"] = professional.name;
        if (this.professionalFilter === "all" && event.title) event["title"] = event.title + " · " + professional.name;
      }

      return event;
    },
    eventClick: function (info) {
      this.selectedEvent = this.calendarEvents.filter(event => event.id == info.event.id)[0];

      this.$myFunctions.openModal({
        instance: this,
        title: "Alterar agendamento",
        saveButton: "Salvar",
        cancelButton: "Cancelar",
        props: {},
        modalContentVariable: "",
        contentObject: this.selectedEvent
      });
    },
    confirmChange: function () {
      return this.$myFunctions.confirmDialog({
        title: "Alterar agendamento",
        message: "Tem certeza que deseja alterar o agendamento?",
        confirmLabel: "Alterar",
        cancelLabel: "Cancelar"
      });
    },
    handleEventResize: async function (info) {
      if (!(await this.confirmChange())) {
        info.revert();
      } else {
        this.changeEventById(info.event.id, info);
      }
    },
    handleEventDrop: async function (info) {
      if (!(await this.confirmChange())) {
        info.revert();
      } else {
        this.changeEventById(info.event.id, info);
      }
    },
    changeEventById: function (eventId, info) {
      let event = this.calendarEvents.find(event => event.id == eventId);

      if (!event) {
        info.revert();
        return;
      }

      event.start = info.event.startStr;
      event.end = info.event.endStr;

      this.updateThisEvent(event);
    },
    updateThisEvent: function (event) {
      // O calendário roda no fuso da empresa: usa a hora de parede da string (moment(...) converteria
      // para o fuso do navegador e gravaria a hora errada quando os dois fusos diferem).
      const startWall = wallClock(event.start);
      const calculatedDuration = event.end ? wallMinutesBetween(event.start, event.end) : 0;

      // Soma das durations dos serviços
      const totalServiceDuration = (event.services || []).reduce((total, service) => {
        return total + parseInt(service.duration || 0);
      }, 0);

      // Define a duração final, obedecendo a lógica desejada
      const finalDuration = (calculatedDuration < totalServiceDuration)
        ? totalServiceDuration
        : calculatedDuration;

      // Lista branca de campos; professional_id é omitido de propósito (no PATCH, omitir mantém o profissional atual).
      const updatedEvent = buildAppointmentPayload({
        ...event,
        date: startWall,
        duration: Number.isNaN(finalDuration) ? totalServiceDuration : finalDuration
      });

      this.$base.api.patch(`/appointments/${event.id}`, updatedEvent)
        .then(() => {
          this.$myFunctions.showToast(this, "Agendamento atualizado", "success");
          return this.getEvents(true); // Atualiza a lista de eventos
        })
        .catch((error) => {
          this.$myFunctions.notifyError(this, error, "Não foi possível atualizar o agendamento");
          // Volta o calendário para o que está salvo no servidor.
          return this.getEvents(true);
        });
    },
    getApi: function () {
      this.calendarApi = this.$refs.fullCalendar.getApi()
    },
    handleDateClick: function (e) {
      // Visão mensal traz só a data; visões com horário trazem data e hora (usa a hora clicada).
      const date = e.allDay || e.dateStr.length <= 10
        ? e.dateStr.slice(0, 10) + "T09:00:00"
        : e.dateStr.slice(0, 19);

      this.selectedEvent = {
        customer_id: null,
        customer_name: "",
        services: [],
        date: date,
        duration: "",
        observations: "",
        // Com um profissional filtrado, o novo agendamento já nasce para ele.
        professional_id: presetProfessionalId(this.professionalFilter, this.professionals)
      }

      this.$myFunctions.openModal({
        instance: this,
        title: "Criar agendamento",
        saveButton: "Criar",
        cancelButton: "Cancelar",
        contentObject: this.selectedEvent
      });
    },
    isSameDay: function (dateString, dateObj) {
      const inputDate = new Date(dateString);

      return (
        inputDate.getFullYear() === dateObj.getFullYear() &&
        inputDate.getMonth() === dateObj.getMonth() &&
        inputDate.getDate() === dateObj.getDate()
      );
    },
    // Recria o calendário só quando muda entre telas pequenas (lista) e grandes, não a cada evento de resize.
    resizeCalendar: function (force = false) {
      const small = window.innerWidth < 480;

      if (force !== true && small === this.responsive) return;

      this.reload = true;
      this._focusDate = this.calendarApi ? this.calendarApi.getDate() : this._focusDate;

      if (small) {
        this.calendarType = "listWeek";
        this.responsive = true;
      } else {
        this.calendarType = "dayGridMonth";
        this.responsive = false;
      }

      this.$nextTick(() => {
        this.reload = false;
      });
    },
    changePeriod: function (position) {
      const period = PERIODS[position];
      if (!period || period.view === this.calendarType) return;

      this._focusDate = this.calendarApi ? this.calendarApi.getDate() : this._focusDate;
      this.reload = true;
      this.calendarType = period.view;

      this.$nextTick(() => {
        this.reload = false;
      });
    }
  }
}
</script>
<style>
.fc .fc-toolbar.fc-header-toolbar {
  margin-top: 1.5em;
}

.fc .fc-daygrid-day.fc-day-today {
  background: var(--verde-escuro);
}

.fc .fc-view-harness-active>.fc-view {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--cinza-medio);
}

.professional-filter {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.professional-filter select {
  width: auto;
  max-width: 100%;
  min-width: 220px;
}

.legendas {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: var(--space-5);
  align-items: center;
  gap: var(--space-5);

  & div {
    padding-left: 2rem;
    display: inline-block;
    position: relative;
  }
}

.pendente::after,
.agendado::after,
.iniciado::after,
.realizado::after,
.cancelado::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--cinza-medio);
  position: absolute;
  left: .7rem;
  top: 0;
  bottom: 0;
  margin: auto;
}

.pendente::after {
  background: #f97316;
}

.agendado::after {
  background: var(--amarelo);
}

.iniciado::after {
  background: var(--azul);
}

.realizado::after {
  background: var(--verde);
}

.cancelado::after {
  background: var(--vermelho);
}

.calendar-header {
  margin-top: var(--space-5);
}

.input-selecao-periodo {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  background: var(--cinza-medio);
  padding: var(--space-3) 3px;
  border-radius: 30px;
  position: relative;
  width: 270px;
}

.input-selecao-periodo button {
  font-weight: 500;
  cursor: pointer;
  z-index: 2;
  background: none;
  border: none;
  text-align: center;
  padding: 0;
}

.input-selecao-periodo .frame-botao {
  position: absolute;
  top: 5%;
  left: 3px;
  background: var(--branco);
  width: calc((100% - 6px) / 3);
  height: 90%;
  border-radius: 30px;
  transition: transform 0.4s;
  z-index: 1;
}

.input-selecao-periodo[data-index="1"] .frame-botao {
  transform: translateX(100%);
}

.input-selecao-periodo[data-index="2"] .frame-botao {
  transform: translateX(200%);
}

.navigation-buttons .btn:not(.btn-square) {
  width: auto;
  padding: 0 var(--space-5);
}

@media (max-width: 768px) {
  .legendas {
    justify-content: flex-start;
    gap: var(--space-3);
  }
}
</style>

<script setup>
definePageMeta({ access: 'member', title: 'Agenda' })
</script>
