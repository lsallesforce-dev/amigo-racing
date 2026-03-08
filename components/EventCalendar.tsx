import { Calendar, dateFnsLocalizer, Event as BigCalendarEvent } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useLocation } from 'wouter';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface EventData {
  id: number;
  name: string;
  date: Date;
  location: string;
  city: string;
  state: string;
  status: string;
  isExternal?: boolean;
}

interface EventCalendarProps {
  events: EventData[];
}

type EventFilter = 'all' | 'platform' | 'external';

export default function EventCalendar({ events }: EventCalendarProps) {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<EventFilter>('all');

  // Filtrar eventos baseado na seleção
  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'platform') return !(event as any).isExternal;
    if (filter === 'external') return (event as any).isExternal;
    return true;
  });

  // Converter eventos para formato do react-big-calendar
  const calendarEvents: BigCalendarEvent[] = filteredEvents.map((event) => {
    // Garantir que a data seja um objeto Date
    const d = new Date(event.date);

    // Criar data local (meia-noite) para evitar problemas de fuso horário na grade
    const localDate = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    );

    return {
      title: event.isExternal ? `🌍 ${event.name}` : event.name,
      start: localDate,
      end: localDate,
      resource: event,
    };
  });

  const handleSelectEvent = (event: BigCalendarEvent) => {
    const eventData = event.resource as EventData;
    setLocation(`/events/${eventData.id}`);
  };

  const eventStyleGetter = (event: BigCalendarEvent) => {
    const eventData = event.resource as EventData;
    let backgroundColor = '#f97316'; // laranja padrão

    if (eventData.status === 'closed') {
      backgroundColor = '#6b7280'; // cinza
    } else if (eventData.status === 'cancelled') {
      backgroundColor = '#ef4444'; // vermelho
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '0.875rem',
        fontWeight: '500',
        padding: '2px 6px',
      },
    };
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2 items-center overflow-x-auto pb-2 scrollbar-hide whitespace-nowrap">
        <span className="text-sm font-medium text-muted-foreground mr-1">Exibir:</span>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
          className="shrink-0"
        >
          Todos os Eventos
        </Button>
        <Button
          variant={filter === 'platform' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('platform')}
          className="shrink-0"
        >
          Eventos da Plataforma
        </Button>
        <Button
          variant={filter === 'external' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('external')}
          className="shrink-0"
        >
          Eventos Externos
        </Button>
      </div>

      {/* Calendário */}
      <div className="h-[600px] bg-card rounded-lg p-4 border">
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          culture="pt-BR"
          messages={{
            next: 'Próximo',
            previous: 'Anterior',
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
            agenda: 'Agenda',
            date: 'Data',
            time: 'Hora',
            event: 'Evento',
            noEventsInRange: 'Não há eventos neste período.',
            showMore: (total: number) => `+ ${total} mais`,
          }}
        />
      </div>
    </div>
  );
}