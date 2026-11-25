import { useState, type FormEvent } from 'react';
import { CalendarX, Trash2 } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { upcomingUnavailability } from '../lib/presence';
import { ministryToday } from '../lib/service-calendar';
import { FormError } from './ui';
import './presence.css';

function dateLabel(date: string) {
  const text = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/** A member marks the days they cannot serve; planners see it when building the scale. */
export default function UnavailabilityCard() {
  const { data, profile, presenceEnabled, setUnavailability, busy } = useMinistry();
  const today = ministryToday();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!presenceEnabled || !profile) return null;
  const personId = profile.personId;
  const dates = personId ? upcomingUnavailability(data, personId, today) : [];
  async function change(target: string, unavailable: boolean, reason = '') {
    if (!personId) return;
    setSaving(true); setError(null);
    try { await setUnavailability(personId, target, unavailable, reason); if (unavailable) { setDate(''); setNote(''); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a data.'); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (date) void change(date, true, note); }
  return <section className="card unavailability-card" aria-labelledby="unavailability-title">
    <h2 id="unavailability-title"><CalendarX size={19} /> Datas em que não posso servir</h2>
    {!personId ? <p className="muted">Peça a um administrador para vincular sua conta a uma pessoa da equipe. Depois disso você poderá marcar suas datas aqui.</p> : <>
      <p className="muted">Quem monta a escala verá um aviso nesses dias.</p>
      <form className="unavailability-form" onSubmit={submit}>
        <label className="field">Data<input type="date" min={today} value={date} required onChange={event => setDate(event.target.value)} /></label>
        <label className="field">Motivo <span className="muted">(opcional)</span><input value={note} maxLength={200} placeholder="Ex.: viagem" onChange={event => setNote(event.target.value)} /></label>
        <button className="button button-primary" disabled={!date || saving || busy}>Marcar data</button>
      </form>
      {dates.length ? <ul className="unavailability-list">{dates.map(item => <li key={item.id}><span><strong>{dateLabel(item.date)}</strong>{item.note && <small>{item.note}</small>}</span><button type="button" className="icon-button" aria-label={`Remover ${dateLabel(item.date)}`} disabled={saving || busy} onClick={() => void change(item.date, false)}><Trash2 size={16} /></button></li>)}</ul>
        : <p className="muted">Nenhuma data marcada.</p>}
    </>}
    <FormError error={error} />
  </section>;
}
