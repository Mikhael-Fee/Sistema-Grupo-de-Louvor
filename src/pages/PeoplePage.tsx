import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, Pencil, Plus, RotateCcw, Search, Users } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { useDraft } from '../hooks/useDraft';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import PhotoPicker, { type PhotoChange } from '../components/PhotoPicker';
import { validatePerson } from '../lib/validation';
import { normalizeSearch } from '../lib/music';
import { getPersonPhoto } from '../lib/avatars';
import { FUNCTIONS, type Person } from '../types';
import './people.css';

const readableError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

function PersonForm({ initial, onSaved, onCancel }: { initial: Person; onSaved: () => void; onCancel: () => void }) {
  const { data, canEditLibrary, busy, savePerson } = useMinistry();
  const existing = data.people.some(person => person.id === initial.id);
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<Person>(`person:${existing ? initial.id : 'new'}`, initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const lock = useRef(false);
  const disabled = saving || busy || photoProcessing;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditLibrary || lock.current || busy || photoProcessing) return;
    const person: Person = { id: draft.id, name: draft.name.trim(), email: draft.email.trim(), functions: [...draft.functions], photoUrl: draft.photoUrl };
    const validation = validatePerson(person);
    if (validation) { setError(validation); return; }
    lock.current = true;
    setSaving(true);
    setError(null);
    try { await savePerson(person, photo); discardDraft(); onSaved(); }
    catch (err) { setError(readableError(err)); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form onSubmit={submit} className="form-grid">
    {hasDraft && <p className="muted" role="status" style={{ gridColumn: '1 / -1', fontSize: 12 }}>Rascunho salvo.</p>}
    <label className="field">Nome<input autoFocus required maxLength={120} disabled={disabled} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Nome e sobrenome" autoComplete="name" /></label>
    <label className="field">E-mail <span className="muted">(opcional)</span><input type="email" maxLength={254} disabled={disabled} value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} placeholder="pessoa@exemplo.com" autoComplete="email" /></label>
    <PhotoPicker name={draft.name || 'nova pessoa'} currentPhotoUrl={getPersonPhoto(initial)} fallbackPhotoUrl={initial.accountPhotoUrl} hasOwnPhoto={Boolean(initial.photoUrl)} value={photo} onChange={setPhoto} onBusyChange={setPhotoProcessing} disabled={saving || busy} />
    <p className="people-photo-note muted">Sem foto própria, usamos a foto da conta vinculada.</p>
    <fieldset className="people-functions-field"><legend>Funções no ministério</legend><div className="people-function-options">{FUNCTIONS.map(fn => <label key={fn} className={`people-function-option ${draft.functions.includes(fn) ? 'active' : ''}`}><input type="checkbox" disabled={disabled} checked={draft.functions.includes(fn)} onChange={event => setDraft({ ...draft, functions: event.target.checked ? [...draft.functions, fn] : draft.functions.filter(value => value !== fn) })} />{fn}</label>)}</div></fieldset>
    <FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={disabled} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={disabled}>{saving ? 'Salvando…' : 'Salvar pessoa'}</button></div>
  </form>;
}

export default function PeoplePage() {
  const { data, mode, canEditLibrary, busy, archivePerson, restorePerson } = useMinistry();
  const [query, setQuery] = useState('');
  const [functionFilter, setFunctionFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const archived = canEditLibrary && showArchived;
  const activeCount = data.people.filter(person => person.active !== false).length;
  const people = useMemo(() => data.people.filter(person =>
    (archived ? person.active === false : person.active !== false)
    && (!query.trim() || normalizeSearch(`${person.name} ${person.email}`).includes(normalizeSearch(query.trim())))
    && (!functionFilter || person.functions.includes(functionFilter))
  ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.people, query, functionFilter, archived]);

  function openEditor(person?: Person) {
    setError(null);
    setEditing(person ? { ...person, functions: [...person.functions] } : { id: crypto.randomUUID(), name: '', email: '', functions: [] });
  }

  async function changeActive(person: Person, active: boolean) {
    if (!canEditLibrary || lock.current || busy) return;
    lock.current = true;
    setSaving(true); setError(null);
    try {
      if (active) await restorePerson(person.id);
      else await archivePerson(person.id);
      setRemoving(null);
    }
    catch (err) { setError(readableError(err)); }
    finally { lock.current = false; setSaving(false); }
  }

  return <>
    <PageHeader title="Nossa equipe" action={canEditLibrary && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Nova pessoa</button>} />
    <div className="people-summary card"><span className="people-summary-icon"><Users size={23} /></span><strong>{activeCount} {activeCount === 1 ? 'pessoa na equipe ativa' : 'pessoas na equipe ativa'}</strong></div>
    <div className="toolbar people-toolbar">
      <label className="people-search"><Search size={18} aria-hidden="true" /><span className="people-sr-only">Buscar pessoas</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === 'public' ? 'Buscar nome…' : 'Buscar nome ou e-mail…'} type="search" /></label>
      <label className="people-function-filter"><span className="people-sr-only">Filtrar por função</span><select value={functionFilter} onChange={event => setFunctionFilter(event.target.value)}><option value="">Todas as funções</option>{FUNCTIONS.map(fn => <option key={fn}>{fn}</option>)}</select></label>
      {canEditLibrary && <label className="people-function-filter"><span className="people-sr-only">Situação na equipe</span><select value={archived ? 'archived' : 'active'} onChange={event => { setShowArchived(event.target.value === 'archived'); setError(null); }}><option value="active">Equipe ativa</option><option value="archived">Pessoas arquivadas</option></select></label>}
    </div>
    {!removing && <FormError error={error} />}
    {people.length ? <div className="people-grid">{people.map((person, index) => {
      return <article className="people-person card" key={person.id}>
        <div className="people-person-heading"><ProfileAvatar name={person.name} photoUrl={getPersonPhoto(person)} size={40} className={`people-avatar people-avatar-${index % 4}`} decorative />{canEditLibrary && <div className="people-person-actions"><button className="icon-button" disabled={saving || busy} aria-label={`Editar ${person.name}`} onClick={() => openEditor(person)}><Pencil size={16} /></button>{person.active === false ? <button className="icon-button" disabled={saving || busy} aria-label={`Reativar ${person.name}`} title="Reativar na equipe" onClick={() => changeActive(person, true)}><RotateCcw size={16} /></button> : <button className="icon-button" disabled={saving || busy} aria-label={`Retirar ${person.name} da equipe`} title="Retirar da equipe ativa" onClick={() => { setError(null); setRemoving(person); }}><Archive size={16} /></button>}</div>}</div>
        <h2>{person.name}</h2><div className="people-functions">{person.functions.map(fn => <span className="badge people-function" key={fn}>{fn}</span>)}</div>
      </article>;
    })}</div> : <EmptyState title={archived ? 'Nenhuma pessoa arquivada encontrada' : activeCount ? 'Nenhuma pessoa encontrada' : 'Sua equipe está vazia'} description={query || functionFilter ? 'Experimente outro nome ou função.' : undefined} action={canEditLibrary && !archived && !activeCount && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Cadastrar pessoa</button>} />}
    {editing && <Modal title={data.people.some(person => person.id === editing.id) ? 'Editar pessoa' : 'Nova pessoa'} onClose={() => { if (!saving && !busy) setEditing(null); }}><PersonForm initial={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} /></Modal>}
    {removing && <Modal title="Retirar da equipe" onClose={() => { if (!saving && !busy) setRemoving(null); }}><p>Retirar <strong>{removing.name}</strong> da equipe ativa?</p><p className="muted">Os cultos, as fotos e a conta vinculada serão preservados. Você poderá reativar essa pessoa depois.</p><FormError error={error} /><div className="form-actions"><button className="button button-secondary" disabled={saving || busy} onClick={() => setRemoving(null)}>Cancelar</button><button className="button people-danger-button" disabled={saving || busy} onClick={() => changeActive(removing, false)}>{saving ? 'Retirando…' : 'Retirar da equipe'}</button></div></Modal>}
  </>;
}
