import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sparkles } from 'lucide-react';
import { Modal } from './ui';
import { calendarDays, calendarMonthLabel, ministryToday, shiftCalendarMonth } from '../lib/service-calendar';
import type { Service } from '../types';

interface Props {
  month: string; onMonthChange: (month: string) => void;
  services: Service[]; visibleServices: Service[];
  canCreate: boolean; busy: boolean; onCreate: (date: string) => void;
}

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ServicesCalendar({ month, onMonthChange, services, visibleServices, canCreate, busy, onCreate }: Props) {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = ministryToday();
  const visibleIds = new Set(visibleServices.map(service => service.id));
  const grouped = new Map<string, Service[]>();
  for (const service of services) grouped.set(service.date, [...(grouped.get(service.date) || []), service]);
  for (const group of grouped.values()) group.sort((a, b) => a.time.localeCompare(b.time) || a.type.localeCompare(b.type, 'pt-BR'));
  const selectedServices = selectedDate ? grouped.get(selectedDate) || [] : [];
  const matchedInMonth = visibleServices.filter(service => service.date.startsWith(`${month}-`)).length;
  const totalInMonth = services.filter(service => service.date.startsWith(`${month}-`)).length;
  function selectDay(date: string, dayServices: Service[]) {
    if (dayServices.length === 1) navigate(`/cultos/${dayServices[0].id}`);
    else if (dayServices.length > 1) setSelectedDate(date);
    else if (canCreate && !busy) onCreate(date);
  }
  return <section className="card services-calendar" aria-label="Calendário de cultos">
    <div className="services-calendar-header"><div><span className="eyebrow">AGENDA DO MINISTÉRIO</span><h2 aria-live="polite">{calendarMonthLabel(month)}</h2></div><div className="services-calendar-navigation"><button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}><ChevronLeft size={20} /></button><button type="button" className="button button-secondary services-calendar-today" onClick={() => onMonthChange(today.slice(0, 7))}>Hoje</button><button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}><ChevronRight size={20} /></button></div></div>
    <div className="services-calendar-legend"><span><i className="calendar-legend-service" /> Culto</span><span><i className="calendar-legend-event" /> Evento</span><span><i className="calendar-legend-today" /> Hoje</span></div>
    <p className="services-calendar-hint">{canCreate ? 'Toque em um dia livre para criar um culto. Nos dias marcados, abra o repertório e a escala.' : 'Toque em um dia marcado para abrir o repertório e a escala.'}</p>
    <div className="services-calendar-weekdays" aria-hidden="true">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="services-calendar-grid">{calendarDays(month).map(day => {
      const entries = grouped.get(day.date) || [];
      const matching = entries.filter(service => visibleIds.has(service.id));
      const hidden = entries.length - matching.length;
      const hasEvent = matching.some(service => service.isEvent);
      const countLabel = !matching.length ? 'filtrado' : matching.every(service => service.isEvent) ? 'evento' : hasEvent ? 'encontro' : 'culto';
      const label = `${dateLabel(day.date)}${entries.length ? `, ${entries.length} ${entries.length === 1 ? 'culto' : 'cultos'}${entries.some(service => service.isEvent) ? ', inclui evento' : ''}${hidden ? `, ${hidden} fora dos filtros` : ''}` : canCreate ? ', dia livre, criar culto' : ', sem culto'}`;
      return <button type="button" key={day.date} data-date={day.date} className={`services-calendar-day ${day.inMonth ? '' : 'calendar-day-outside'} ${day.date === today ? 'calendar-day-today' : ''} ${matching.length ? 'calendar-day-service' : ''} ${hasEvent ? 'calendar-day-event' : ''} ${entries.length && !matching.length ? 'calendar-day-filtered' : ''}`} aria-label={label} aria-current={day.date === today ? 'date' : undefined} disabled={!entries.length && (!canCreate || busy)} onClick={() => selectDay(day.date, entries)}>
        <span className="calendar-day-number">{day.day}</span>
        <span className="calendar-day-detail" aria-hidden="true">{matching.slice(0, 2).map(service => <span className={`calendar-day-entry ${service.isEvent ? 'calendar-entry-event' : ''}`} key={service.id}><span>{service.isEvent && <><Sparkles size={11} /> Evento · </>}{service.time}</span><strong>{service.type}</strong></span>)}{matching.length > 2 && <small>+{matching.length - 2} cultos</small>}{hidden > 0 && <small className="calendar-filtered-label">{hidden} fora dos filtros</small>}</span>
        {entries.length > 0 && <span className="calendar-day-mobile-count" aria-hidden="true">{matching.length || entries.length}<span>{countLabel}{(matching.length || entries.length) > 1 ? 's' : ''}</span></span>}
      </button>;
    })}</div>
    <p className="services-calendar-count" role="status">{matchedInMonth ? `${matchedInMonth} ${matchedInMonth === 1 ? 'culto neste mês' : 'cultos neste mês'}` : totalInMonth ? 'Nenhum culto deste mês corresponde aos filtros. Os dias ocupados continuam marcados.' : 'Nenhum culto cadastrado neste mês.'}</p>
    {selectedDate && <Modal title={`Cultos de ${dateLabel(selectedDate)}`} onClose={() => setSelectedDate(null)}><p className="muted calendar-selection-description">Escolha o encontro para ver o repertório e a equipe.</p><div className="calendar-service-choices">{selectedServices.map(service => <Link key={service.id} to={`/cultos/${service.id}`} className="calendar-service-choice"><span className={service.isEvent ? 'calendar-choice-event-icon' : 'calendar-choice-icon'}>{service.isEvent ? <Sparkles size={20} /> : <CalendarDays size={20} />}</span><span><strong>{service.type}</strong><small><Clock3 size={13} /> {service.time}{service.isEvent && ' · Evento'}{!visibleIds.has(service.id) && ' · Fora dos filtros'}</small></span><ChevronRight size={18} /></Link>)}</div></Modal>}
  </section>;
}
