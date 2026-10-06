import { useMemo, useState, type FormEvent } from 'react';
import { Mail, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { validatePerson } from '../lib/validation';
import { normalizeSearch } from '../lib/music';
import { FUNCTIONS, type Person } from '../types';
import './people.css';

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
const readableError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

export default function PeoplePage() {
  const { data, canEditLibrary, savePerson, deletePerson } = useMinistry();
  const [query, setQuery] = useState('');
  const [functionFilter, setFunctionFilter] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const people = useMemo(() => data.people.filter(person =>
    (!query.trim() || normalizeSearch(`${person.name} ${person.email}`).includes(normalizeSearch(query.trim())))
    && (!functionFilter || person.functions.includes(functionFilter))
  ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.people, query, functionFilter]);

  function openEditor(person?: Person) {
    setError(null);
    setEditing(person ? { ...person, functions: [...person.functions] } : { id: crypto.randomUUID(), name: '', email: '', functions: [] });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canEditLibrary) return;
    const person = { ...editing, name: editing.name.trim(), email: editing.email.trim() };
    const validation = validatePerson(person);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null);
    try { await savePerson(person); setEditing(null); }
    catch (err) { setError(readableError(err)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!removing || !canEditLibrary) return;
    setSaving(true); setError(null);
    try { await deletePerson(removing.id); setRemoving(null); }
    catch (err) { setError(readableError(err)); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Juntos no mesmo propósito" title="Nossa equipe" description="As vozes e os instrumentos que fazem parte do ministério." action={canEditLibrary && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Nova pessoa</button>} />
    <div className="people-summary card"><span className="people-summary-icon"><Users size={23} /></span><div><strong>{data.people.length} {data.people.length === 1 ? 'pessoa no ministério' : 'pessoas no ministério'}</strong><p className="muted">Cada talento tem seu lugar.</p></div><span className="people-summary-note">Servindo em unidade</span></div>
    <div className="toolbar people-toolbar">
      <label className="people-search"><Search size={18} aria-hidden="true" /><span className="people-sr-only">Buscar pessoas</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome ou e-mail…" type="search" /></label>
      <label className="people-function-filter"><span className="people-sr-only">Filtrar por função</span><select value={functionFilter} onChange={event => setFunctionFilter(event.target.value)}><option value="">Todas as funções</option>{FUNCTIONS.map(fn => <option key={fn}>{fn}</option>)}</select></label>
    </div>
    {people.length ? <div className="people-grid">{people.map((person, index) => {
      const inUse = data.services.some(service => service.assignments.some(assignment => assignment.personId === person.id));
      return <article className="people-person card" key={person.id}>
        <div className="people-person-heading"><span className={`people-avatar people-avatar-${index % 4}`} aria-hidden="true">{initials(person.name)}</span>{canEditLibrary && <div className="people-person-actions"><button className="icon-button" aria-label={`Editar ${person.name}`} onClick={() => openEditor(person)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Excluir ${person.name}`} disabled={inUse} title={inUse ? 'Esta pessoa está na escala de um culto.' : 'Excluir pessoa'} onClick={() => { setError(null); setRemoving(person); }}><Trash2 size={16} /></button></div>}</div>
        <h2>{person.name}</h2><div className="people-functions">{person.functions.map(fn => <span className="badge people-function" key={fn}>{fn}</span>)}</div>
        <div className="people-contact">{person.email ? <a href={`mailto:${person.email}`}><Mail size={15} />{person.email}</a> : <span className="muted">Sem e-mail cadastrado</span>}</div>
      </article>;
    })}</div> : <EmptyState title={data.people.length ? 'Nenhuma pessoa encontrada' : 'Uma equipe começa com pessoas'} description={data.people.length ? 'Experimente outro nome ou função.' : 'Cadastre músicos e vocalistas para montar a escala dos cultos.'} action={canEditLibrary && !data.people.length && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Cadastrar pessoa</button>} />}
    {editing && <Modal title={data.people.some(person => person.id === editing.id) ? 'Editar pessoa' : 'Nova pessoa'} onClose={() => { if (!saving) setEditing(null); }}>
      <form onSubmit={submit} className="form-grid">
        <label className="field">Nome<input autoFocus required maxLength={120} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="Nome e sobrenome" autoComplete="name" /></label>
        <label className="field">E-mail <span className="muted">(opcional)</span><input type="email" maxLength={254} value={editing.email} onChange={event => setEditing({ ...editing, email: event.target.value })} placeholder="pessoa@exemplo.com" autoComplete="email" /></label>
        <fieldset className="people-functions-field"><legend>Funções no ministério</legend><p className="muted">Selecione uma ou mais funções. A função de cada culto será definida na escala.</p><div className="people-function-options">{FUNCTIONS.map(fn => <label key={fn} className={`people-function-option ${editing.functions.includes(fn) ? 'active' : ''}`}><input type="checkbox" checked={editing.functions.includes(fn)} onChange={event => setEditing({ ...editing, functions: event.target.checked ? [...editing.functions, fn] : editing.functions.filter(value => value !== fn) })} />{fn}</label>)}</div></fieldset>
        <FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar pessoa'}</button></div>
      </form>
    </Modal>}
    {removing && <Modal title="Excluir pessoa" onClose={() => { if (!saving) setRemoving(null); }}><p>Excluir <strong>{removing.name}</strong> do cadastro de pessoas?</p><p className="muted">Esta ação não pode ser desfeita.</p><FormError error={error} /><div className="form-actions"><button className="button button-secondary" disabled={saving} onClick={() => setRemoving(null)}>Cancelar</button><button className="button people-danger-button" disabled={saving} onClick={remove}>{saving ? 'Excluindo…' : 'Excluir pessoa'}</button></div></Modal>}
  </>;
}
