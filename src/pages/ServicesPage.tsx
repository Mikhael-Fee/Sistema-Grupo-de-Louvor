import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Clock3, Music2, Pencil, Plus, Search, Users } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { validateService } from '../lib/validation';
import { SERVICE_TYPES, type Service } from '../types';
import './services.css';

export function formatServiceDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', options);
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function newService(): Service {
  return { id: crypto.randomUUID(), date: today(), time: '19:00', type: SERVICE_TYPES[0], notes: '', assignments: [], repertoire: [] };
}

export function ServiceForm({ initial, onSave, onCancel, busy }: { initial: Service; onSave: (service: Service) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const { data } = useMinistry();
  const [draft, setDraft] = useState<Service>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || busy) return;
    const cleaned = { ...draft, type: draft.type.trim(), notes: draft.notes.trim() };
    const validationError = validateService(cleaned, data);
    if (validationError) { setError(validationError); return; }
    lock.current = true;
    setSaving(true);
    setError(null);
    try { await onSave(cleaned); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o culto. Tente novamente.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form onSubmit={submit} className="service-form">
    <div className="form-grid">
      <label className="field"><span>Data</span><input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label className="field"><span>Horário</span><input type="time" required value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>
      <label className="field service-form-full"><span>Tipo de culto</span><select required value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{!SERVICE_TYPES.includes(draft.type) && <option value={draft.type}>{draft.type}</option>}{SERVICE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="field service-form-full"><span>Observações <span className="muted">(opcional)</span></span><textarea rows={4} placeholder="Orientações para a equipe, tema ou detalhes do culto…" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    </div>
    <FormError error={error} />
    <div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={onCancel}>Cancelar</button><button className="button button-primary" disabled={saving || busy}>{saving ? 'Salvando…' : 'Salvar culto'}</button></div>
  </form>;
}

export default function ServicesPage() {
  const { data, canPlan, busy, error, saveService } = useMinistry();
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Service | null>(null);
  const now = Date.now();
  const isUpcoming = (service: Service) => new Date(`${service.date}T${service.time || '00:00'}`).getTime() >= now;
  const upcoming = data.services.filter(isUpcoming);
  const past = data.services.filter(service => !isUpcoming(service));
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = data.services.filter(service =>
    (filter === 'all' || (filter === 'upcoming' ? isUpcoming(service) : !isUpcoming(service))) &&
    (!typeFilter || service.type === typeFilter) &&
    (!query || `${service.type} ${service.notes} ${formatServiceDate(service.date)} ${service.date}`.toLocaleLowerCase('pt-BR').includes(query))
  ).sort((a, b) => filter === 'past' ? `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) : `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const types = [...new Set([...SERVICE_TYPES, ...data.services.map(service => service.type)])];
  return <>
    <PageHeader eyebrow="PLANEJAMENTO" title="Cultos" description="Cada encontro, preparado com propósito." action={canPlan && <button className="button button-primary" onClick={() => setEditing(newService())} disabled={busy}><Plus size={18} /> Novo culto</button>} />
    <FormError error={error} />
    <div className="services-summary"><div><span className="services-summary-icon"><CalendarDays size={20} /></span><p><strong>{upcoming.length}</strong><span>Cultos a caminho</span></p></div><div><span className="services-summary-icon"><Users size={20} /></span><p><strong>{new Set(upcoming.flatMap(service => service.assignments.map(item => item.personId))).size}</strong><span>Pessoas escaladas</span></p></div><div><span className="services-summary-icon"><Music2 size={20} /></span><p><strong>{upcoming.reduce((count, service) => count + service.repertoire.length, 0)}</strong><span>Músicas no repertório</span></p></div></div>
    <div className="toolbar services-toolbar"><div className="chips" aria-label="Período dos cultos">{([{ value: 'upcoming', label: `Próximos (${upcoming.length})` }, { value: 'past', label: `Anteriores (${past.length})` }, { value: 'all', label: 'Todos' }] as const).map(item => <button key={item.value} className={`chip ${filter === item.value ? 'active' : ''}`} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><div className="services-filters"><label className="services-search"><Search size={18} /><input aria-label="Buscar cultos" placeholder="Buscar culto…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filtrar por tipo de culto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">Todos os tipos</option>{types.map(type => <option key={type}>{type}</option>)}</select></div></div>
    {filtered.length ? <div className="services-list">{filtered.map(service => <article className="card services-card" key={service.id}>
      <div className="services-date" aria-label={formatServiceDate(service.date)}><span>{formatServiceDate(service.date, { month: 'short' }).replace('.', '')}</span><strong>{service.date.slice(8, 10)}</strong><span>{formatServiceDate(service.date, { weekday: 'short' }).replace('.', '')}</span></div>
      <div className="services-card-content"><div className="services-card-title"><Link to={`/cultos/${service.id}`}><h2>{service.type}</h2></Link><span className={`badge ${isUpcoming(service) ? 'service-badge-upcoming' : ''}`}>{isUpcoming(service) ? 'Programado' : 'Realizado'}</span></div><div className="services-meta"><span><Clock3 size={15} /> {service.time}</span><span><Users size={15} /> {service.assignments.length} na equipe</span><span><Music2 size={15} /> {service.repertoire.length} músicas</span></div>{service.notes && <p className="services-note">{service.notes}</p>}</div>
      <div className="services-card-actions">{canPlan && <button className="icon-button" title="Editar culto" aria-label={`Editar ${service.type} de ${formatServiceDate(service.date)}`} onClick={() => setEditing(service)} disabled={busy}><Pencil size={17} /></button>}<Link className="button button-secondary" to={`/cultos/${service.id}`}>Ver culto <ArrowUpRight size={16} /></Link></div>
    </article>)}</div> : <EmptyState title={query || typeFilter ? 'Nenhum culto encontrado' : filter === 'past' ? 'Ainda não há cultos anteriores' : 'Um novo encontro começa aqui'} description={query || typeFilter ? 'Experimente outro termo ou altere os filtros.' : filter === 'past' ? 'Os cultos realizados aparecerão nesta lista.' : 'Prepare a equipe e o repertório do próximo culto.'} action={canPlan && !query && !typeFilter && <button className="button button-primary" onClick={() => setEditing(newService())} disabled={busy}><Plus size={18} /> Criar culto</button>} />}
    {editing && <Modal title={data.services.some(service => service.id === editing.id) ? 'Editar culto' : 'Novo culto'} onClose={() => { if (!busy) setEditing(null); }}><ServiceForm initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={async service => { await saveService(service); setEditing(null); }} /></Modal>}
  </>;
}
