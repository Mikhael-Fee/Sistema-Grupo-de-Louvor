import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { STATUS_LABELS } from '../lib/presence';
import type { Assignment, AssignmentStatus } from '../types';
import { FormError } from './ui';
import './presence.css';

/** Lets the person answer every function they have in one service at once. */
export default function PresenceButtons({ assignments, tone = 'light' }: { assignments: Assignment[]; tone?: 'light' | 'dark' }) {
  const { respondAssignment, busy } = useMinistry();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!assignments.length) return null;
  const status: AssignmentStatus = assignments[0].status ?? 'pending';
  async function answer(next: AssignmentStatus, reason = '') {
    setSaving(true); setError(null);
    try {
      for (const assignment of assignments) await respondAssignment(assignment.id, next, reason);
      setDeclining(false); setNote('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar sua resposta.'); }
    finally { setSaving(false); }
  }
  const disabled = saving || busy;
  return <div className={`presence presence-${tone}`} role="group" aria-label="Sua presença neste culto">
    <span className={`presence-status presence-${status}`}>{status === 'confirmed' ? <Check size={14} /> : status === 'declined' ? <X size={14} /> : null}{STATUS_LABELS[status]}</span>
    {!declining && <div className="presence-actions">
      <button type="button" className="button button-primary" aria-pressed={status === 'confirmed'} disabled={disabled || status === 'confirmed'} onClick={() => void answer('confirmed')}><Check size={15} />Confirmar presença</button>
      <button type="button" className="button button-secondary" aria-pressed={status === 'declined'} disabled={disabled} onClick={() => setDeclining(true)}><X size={15} />{status === 'declined' ? 'Mudar motivo' : 'Não poderei'}</button>
    </div>}
    {declining && <form className="presence-decline" onSubmit={event => { event.preventDefault(); void answer('declined', note); }}>
      <label className="field">Motivo <span className="muted">(opcional)</span><input value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="Ex.: viagem, trabalho" /></label>
      <div className="presence-actions"><button className="button button-primary" disabled={disabled}>Avisar que não poderei</button><button type="button" className="button button-ghost" disabled={disabled} onClick={() => setDeclining(false)}>Cancelar</button></div>
    </form>}
    {status === 'declined' && assignments[0].statusNote && !declining && <small className="presence-note">Motivo: {assignments[0].statusNote}</small>}
    <FormError error={error} />
  </div>;
}

export function StatusBadge({ assignment, unavailableNote }: { assignment: Assignment; unavailableNote?: string }) {
  const status = assignment.status ?? 'pending';
  return <span className="presence-badges">
    <span className={`presence-status presence-${status}`} title={assignment.statusNote || undefined}>{status === 'confirmed' ? <Check size={12} /> : status === 'declined' ? <X size={12} /> : null}{status === 'pending' ? 'Aguardando' : STATUS_LABELS[status]}</span>
    {unavailableNote !== undefined && <span className="presence-status presence-unavailable" title={unavailableNote || undefined}>Marcou indisponível</span>}
  </span>;
}
