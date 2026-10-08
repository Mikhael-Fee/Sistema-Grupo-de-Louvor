import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Clock3, Copy, Music2, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import { useMinistry } from '../context/MinistryContext';
import { useDraft } from '../hooks/useDraft';
import { validateService } from '../lib/validation';
import { getPersonPhoto } from '../lib/avatars';
import { SERVICE_TYPES, type Assignment, type Person, type Service, type SetlistItem, type Song } from '../types';
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

function serviceTypeSuggestions(services: Service[], currentType = ''): string[] {
  return [...new Set([...SERVICE_TYPES, ...services.map(service => service.type), currentType].map(type => type.trim()).filter(Boolean))];
}

export interface TeamPickerDraft { selection: Record<string, string>; search: string; additional?: Record<string, string[]> }
export interface RepertoirePickerDraft { selection: string[]; search: string }
interface ServiceEditorDraft { service: Service; team: TeamPickerDraft; showTeamPicker: boolean; repertoire?: RepertoirePickerDraft; showRepertoirePicker?: boolean }

/** Keep existing entries intact and append new songs in the order they were selected. */
export function selectedRepertoireItems(selection: string[], service: Service, songs: Song[]): SetlistItem[] {
  const library = new Map(songs.map(song => [song.id, song]));
  const included = new Set(service.repertoire.map(item => item.songId));
  return selection.flatMap(songId => {
    const song = library.get(songId);
    if (!song || included.has(songId)) return [];
    included.add(songId);
    return [{ id: crypto.randomUUID(), songId, key: song.churchKey || song.originalKey, notes: '' }];
  });
}

export function RepertoirePicker({ service, songs, value, onChange, disabled }: { service: Service; songs: Song[]; value: RepertoirePickerDraft; onChange: (value: RepertoirePickerDraft) => void; disabled: boolean }) {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const query = normalize(value.search.trim());
  const existing = new Set(service.repertoire.map(item => item.songId));
  const selected = value.selection.filter((id, index, selection) => selection.indexOf(id) === index && !existing.has(id) && songs.some(song => song.id === id));
  const visible = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR') || a.artist.localeCompare(b.artist, 'pt-BR')).filter(song => !query || normalize(`${song.title} ${song.artist}`).includes(query));
  const eligible = visible.filter(song => !existing.has(song.id));
  const allVisibleSelected = eligible.length > 0 && eligible.every(song => selected.includes(song.id));
  function selectVisible() {
    const visibleIds = new Set(eligible.map(song => song.id));
    onChange({ ...value, selection: allVisibleSelected ? selected.filter(id => !visibleIds.has(id)) : [...selected, ...eligible.filter(song => !selected.includes(song.id)).map(song => song.id)] });
  }
  return <div className="service-repertoire-picker">
    <label className="field"><span>Buscar músicas</span><input placeholder="Título ou artista" value={value.search} disabled={disabled} onChange={event => onChange({ ...value, search: event.target.value })} /></label>
    <div className="service-batch-toolbar"><button type="button" className="button button-ghost" disabled={disabled || !eligible.length} onClick={selectVisible}>{allVisibleSelected ? 'Desmarcar visíveis' : 'Selecionar visíveis'}</button><span role="status">{selected.length} {selected.length === 1 ? 'música selecionada' : 'músicas selecionadas'}</span>{selected.length > 0 && <button type="button" className="button button-ghost" disabled={disabled} onClick={() => onChange({ ...value, selection: [] })}>Limpar seleção</button>}</div>
    <div className="service-song-options">{visible.map(song => {
      const included = existing.has(song.id);
      const checked = included || selected.includes(song.id);
      return <label key={song.id} className={`service-song-option ${checked ? 'service-song-selected' : ''} ${included ? 'service-song-included' : ''}`}><input type="checkbox" aria-label={`Selecionar ${song.title}`} checked={checked} disabled={disabled || included} onChange={event => onChange({ ...value, selection: event.target.checked ? [...selected, song.id] : selected.filter(id => id !== song.id) })} /><span><strong>{song.title}</strong><small>{song.artist}</small>{included && <small>Já no repertório</small>}</span><span className="service-key">{song.churchKey || song.originalKey}</span></label>;
    })}{!visible.length && <p className="muted service-batch-empty">Nenhuma música corresponde à busca.</p>}</div>
    {selected.length > 0 && <p className="muted service-repertoire-selection">A ordem dos cliques será a ordem das músicas no repertório. Você pode reorganizar depois.</p>}
  </div>;
}

export function teamPickerFromAssignments(assignments: Assignment[]): TeamPickerDraft {
  const selection: Record<string, string> = {};
  const additional: Record<string, string[]> = {};
  for (const assignment of assignments) {
    if (!selection[assignment.personId]) selection[assignment.personId] = assignment.function;
    else if (selection[assignment.personId] !== assignment.function) {
      additional[assignment.personId] = [...new Set([...(additional[assignment.personId] || []), assignment.function])];
    }
  }
  return { selection, additional, search: '' };
}

export function selectedTeamAssignments(selection: Record<string, string>, service: Service, people: Person[], additional: Record<string, string[]> = {}, includeCurrent = false): Assignment[] {
  return Object.entries(selection).flatMap(([personId, personFunction]) => {
    const person = people.find(item => item.id === personId);
    if (!person?.functions.includes(personFunction)) return [];
    return [...new Set([personFunction, ...(additional[personId] || [])])].flatMap(selectedFunction => {
      if (!person.functions.includes(selectedFunction)) return [];
      const current = service.assignments.find(item => item.personId === personId && item.function === selectedFunction);
      if (current && !includeCurrent) return [];
      return [{ id: current?.id || crypto.randomUUID(), personId, function: selectedFunction }];
    });
  });
}

export function restoreTeamPickerDraft(draft: TeamPickerDraft, service: Service, people: Person[]): TeamPickerDraft {
  if (draft.additional) return draft;
  // Earlier drafts only held additions; keep the saved team when upgrading that draft.
  return { ...teamPickerFromAssignments([...service.assignments, ...selectedTeamAssignments(draft.selection, service, people)]), search: draft.search };
}

export function mergeTeamAssignments(current: Assignment[], additions: Assignment[], people: Person[]): Assignment[] {
  const signatures = new Set(current.map(item => `${item.personId}:${item.function}`));
  const unique = additions.filter(item => {
    const signature = `${item.personId}:${item.function}`;
    if (signatures.has(signature) || !people.some(person => person.id === item.personId && person.functions.includes(item.function))) return false;
    signatures.add(signature);
    return true;
  }).map(item => ({ ...item, id: crypto.randomUUID() }));
  return [...current, ...unique];
}

export function previousTeamService(service: Service, services: Service[]) {
  return services.filter(item => item.id !== service.id && item.assignments.length && `${item.date}T${item.time}` < `${service.date}T${service.time}`)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0];
}

export function TeamPicker({ service, people, value, onChange, disabled, editExisting = false }: { service: Service; people: Person[]; value: TeamPickerDraft; onChange: (value: TeamPickerDraft) => void; disabled: boolean; editExisting?: boolean }) {
  const query = value.search.trim().toLocaleLowerCase('pt-BR');
  const availableFunctions = (person: Person) => editExisting ? person.functions : person.functions.filter(personFunction => !service.assignments.some(item => item.personId === person.id && item.function === personFunction));
  const visible = [...people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).filter(person => !query || `${person.name} ${person.email} ${person.functions.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query));
  const eligible = visible.filter(person => availableFunctions(person).length);
  const selected = people.filter(person => availableFunctions(person).includes(value.selection[person.id])).length;
  const allVisibleSelected = eligible.length > 0 && eligible.every(person => availableFunctions(person).includes(value.selection[person.id]));
  function selectVisible() {
    const selection = { ...value.selection };
    const additional = { ...value.additional };
    for (const person of eligible) {
      if (allVisibleSelected) { delete selection[person.id]; delete additional[person.id]; }
      else if (!availableFunctions(person).includes(selection[person.id])) selection[person.id] = availableFunctions(person)[0];
    }
    onChange({ ...value, selection, additional });
  }
  return <div className="service-team-picker">
    <label className="field"><span>Buscar pessoas</span><input placeholder="Nome, e-mail ou função" value={value.search} disabled={disabled} onChange={event => onChange({ ...value, search: event.target.value })} /></label>
    <div className="service-batch-toolbar"><button type="button" className="button button-ghost" disabled={disabled || !eligible.length} onClick={selectVisible}>{allVisibleSelected ? 'Desmarcar visíveis' : 'Selecionar visíveis'}</button><span>{selected} {selected === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}</span>{selected > 0 && <button type="button" className="button button-ghost" disabled={disabled} onClick={() => onChange({ ...value, selection: {}, additional: {} })}>Limpar seleção</button>}</div>
    <div className="service-batch-list">{visible.map(person => {
      const functions = availableFunctions(person);
      const checked = functions.includes(value.selection[person.id]);
      return <div key={person.id} className={`service-batch-person ${checked ? 'service-batch-selected' : ''}`}>
        <label className="service-batch-check"><input type="checkbox" aria-label={`Selecionar ${person.name}`} checked={checked} disabled={disabled || !functions.length} onChange={event => { const selection = { ...value.selection }; const additional = { ...value.additional }; if (event.target.checked) selection[person.id] = functions[0]; else { delete selection[person.id]; delete additional[person.id]; } onChange({ ...value, selection, additional }); }} /><ProfileAvatar name={person.name} photoUrl={getPersonPhoto(person)} size={36} className="service-picker-avatar" decorative /><span className="service-batch-identity"><strong>{person.name}</strong><small>{person.functions.join(' · ') || 'Sem função cadastrada'}</small></span></label>
        {functions.length ? <select aria-label={`Função de ${person.name}`} disabled={disabled || !checked} value={checked ? value.selection[person.id] : functions[0]} onChange={event => onChange({ ...value, selection: { ...value.selection, [person.id]: event.target.value }, additional: { ...value.additional, [person.id]: (value.additional?.[person.id] || []).filter(item => item !== event.target.value) } })}>{functions.map(personFunction => <option key={personFunction}>{personFunction}</option>)}</select> : <span className="badge">{person.functions.length ? 'Já na escala' : 'Sem função'}</span>}
        {editExisting && checked && functions.length > 1 && <details className="service-batch-functions"><summary>{value.additional?.[person.id]?.length ? `${value.additional[person.id].length + 1} funções selecionadas` : 'Outras funções'}</summary><div>{functions.filter(item => item !== value.selection[person.id]).map(personFunction => <label key={personFunction}><input type="checkbox" aria-label={`Também ${person.name} em ${personFunction}`} checked={value.additional?.[person.id]?.includes(personFunction) || false} disabled={disabled} onChange={event => { const additions = new Set(value.additional?.[person.id] || []); if (event.target.checked) additions.add(personFunction); else additions.delete(personFunction); onChange({ ...value, additional: { ...value.additional, [person.id]: [...additions] } }); }} />{personFunction}</label>)}</div></details>}
      </div>;
    })}{!visible.length && <p className="muted service-batch-empty">Nenhuma pessoa encontrada. Experimente outro nome ou função.</p>}</div>
  </div>;
}

export function ServiceForm({ initial, onSave, onCancel, busy }: { initial: Service; onSave: (service: Service) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const { data } = useMinistry();
  const existing = data.services.some(service => service.id === initial.id);
  const { draft: editor, setDraft: setEditor, discardDraft, hasDraft } = useDraft<ServiceEditorDraft>(`service:${existing ? initial.id : 'new'}`, { service: initial, team: teamPickerFromAssignments(initial.assignments), showTeamPicker: false });
  const draft = editor.service;
  const setDraft = (service: Service) => setEditor(current => ({ ...current, service }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const typeSuggestionsId = useId();
  const typeHintId = useId();
  const types = serviceTypeSuggestions(data.services, initial.type);
  const lock = useRef(false);
  const previousService = previousTeamService(draft, data.services);
  const team = restoreTeamPickerDraft(editor.team, draft, data.people);
  const selectedAssignments = selectedTeamAssignments(team.selection, draft, data.people, team.additional, true);
  const activeAssignments = editor.showTeamPicker ? selectedAssignments : draft.assignments;
  const repertoire = editor.repertoire || { selection: [], search: '' };
  const selectedSongs = repertoire.selection.filter((id, index, selection) => selection.indexOf(id) === index && data.songs.some(song => song.id === id) && !draft.repertoire.some(item => item.songId === id));
  const repertoireCount = draft.repertoire.length + (editor.showRepertoirePicker ? selectedSongs.length : 0);
  function applyTeam(assignments: Assignment[]) {
    setEditor(current => ({ ...current, service: { ...current.service, assignments }, team: teamPickerFromAssignments(assignments), showTeamPicker: false }));
  }
  function applyRepertoire() {
    setEditor(current => ({ ...current, service: { ...current.service, repertoire: [...current.service.repertoire, ...selectedRepertoireItems(current.repertoire?.selection || [], current.service, data.songs)] }, repertoire: { selection: [], search: '' }, showRepertoirePicker: false }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || busy) return;
    const cleaned = { ...draft, assignments: activeAssignments, repertoire: editor.showRepertoirePicker ? [...draft.repertoire, ...selectedRepertoireItems(selectedSongs, draft, data.songs)] : draft.repertoire, type: draft.type.trim(), notes: draft.notes.trim() };
    const validationError = validateService(cleaned, data);
    if (validationError) { setError(validationError); return; }
    lock.current = true;
    setSaving(true);
    setError(null);
    try { await onSave(cleaned); discardDraft(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o culto. Tente novamente.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form onSubmit={submit} className="service-form">
    {hasDraft && <p className="service-draft-status" role="status">Rascunho guardado nesta aba. Você pode sair e continuar depois.</p>}
    <div className="form-grid">
      <label className="field"><span>Data</span><input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label className="field"><span>Horário</span><input type="time" required value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>
      <label className="field service-form-full"><span>Tipo de culto</span><input aria-label="Tipo de culto" aria-describedby={typeHintId} list={typeSuggestionsId} required maxLength={100} value={draft.type} placeholder="Ex.: Santa Ceia ou Culto de Louvor" disabled={busy || saving} onChange={e => setDraft({ ...draft, type: e.target.value })} /><datalist id={typeSuggestionsId}>{types.map(type => <option key={type} value={type} />)}</datalist><small id={typeHintId}>Escolha uma sugestão ou escreva a temática do culto. O nome salvo ficará disponível nos próximos cultos.</small></label>
      <label className="field service-form-full"><span>Observações <span className="muted">(opcional)</span></span><textarea rows={4} placeholder="Orientações para a equipe, tema ou detalhes do culto…" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    </div>
    <fieldset className="service-editor-team"><legend>Escala do culto <span className="badge">{activeAssignments.length}</span></legend><p className="muted">Monte a equipe agora. A escala será salva junto com o culto.</p>
      {activeAssignments.length > 0 && <ul className="service-editor-assignments">{activeAssignments.map(assignment => {
        const person = data.people.find(item => item.id === assignment.personId);
        return <li key={assignment.id}><div className="service-editor-person"><ProfileAvatar name={person?.name || 'Pessoa indisponível'} photoUrl={getPersonPhoto(person)} size={34} className="service-editor-avatar" decorative /><span><strong>{person?.name || 'Pessoa indisponível'}</strong><small>{assignment.function}</small></span></div><button type="button" className="icon-button" aria-label={`Remover ${person?.name || 'pessoa'} da escala em edição`} disabled={busy || saving} onClick={() => applyTeam(activeAssignments.filter(item => item.id !== assignment.id))}><X size={16} /></button></li>;
      })}</ul>}
      <div className="service-editor-team-actions"><button type="button" className="button button-secondary" disabled={busy || saving || !data.people.length} aria-expanded={editor.showTeamPicker} onClick={() => editor.showTeamPicker ? applyTeam(selectedAssignments) : setEditor(current => ({ ...current, showTeamPicker: true }))}><Users size={16} /> {editor.showTeamPicker ? 'Concluir seleção' : draft.assignments.length ? 'Editar equipe' : 'Selecionar equipe'}</button>{previousService && <button type="button" className="button button-ghost" disabled={busy || saving} title={`${previousService.type} · ${formatServiceDate(previousService.date)}`} onClick={() => applyTeam(mergeTeamAssignments(activeAssignments, previousService.assignments, data.people))}><Copy size={15} /> Reutilizar última escala</button>}</div>
      {!data.people.length && <p className="muted">Cadastre as pessoas e suas funções na equipe para montar a escala.</p>}
      {editor.showTeamPicker && <><TeamPicker service={draft} people={data.people} value={team} editExisting disabled={busy || saving} onChange={team => setEditor(current => ({ ...current, team }))} /><div className="service-batch-add"><button type="button" className="button button-secondary" disabled={busy || saving} onClick={() => applyTeam(selectedAssignments)}>Aplicar equipe ({selectedAssignments.length})</button></div></>}
    </fieldset>
    <fieldset className="service-editor-team service-editor-repertoire"><legend>Repertório do culto <span className="badge">{repertoireCount}</span></legend><p className="muted">Escolha todas as músicas de uma vez. O repertório será salvo junto com o culto.</p>
      {draft.repertoire.length > 0 && <ol className="service-editor-assignments service-editor-song-list">{draft.repertoire.map((item, index) => {
        const song = data.songs.find(candidate => candidate.id === item.songId);
        return <li key={item.id}><span><strong>{index + 1}. {song?.title || 'Música indisponível'}</strong><small>Tom {item.key}{item.notes ? ` · ${item.notes}` : ''}</small></span><button type="button" className="icon-button" aria-label={`Remover ${song?.title || 'música'} do repertório em edição`} disabled={busy || saving} onClick={() => setDraft({ ...draft, repertoire: draft.repertoire.filter(candidate => candidate.id !== item.id) })}><X size={16} /></button></li>;
      })}</ol>}
      <div className="service-editor-team-actions"><button type="button" className="button button-secondary" disabled={busy || saving || !data.songs.length} aria-expanded={!!editor.showRepertoirePicker} onClick={() => editor.showRepertoirePicker ? applyRepertoire() : setEditor(current => ({ ...current, showRepertoirePicker: true, repertoire: current.repertoire || { selection: [], search: '' } }))}><Music2 size={16} /> {editor.showRepertoirePicker ? 'Concluir seleção de músicas' : 'Selecionar músicas'}</button></div>
      {!data.songs.length && <p className="muted">Cadastre as músicas na biblioteca para montar o repertório.</p>}
      {editor.showRepertoirePicker && <><RepertoirePicker service={draft} songs={data.songs} value={repertoire} disabled={busy || saving} onChange={repertoire => setEditor(current => ({ ...current, repertoire }))} /><div className="service-batch-add"><button type="button" className="button button-secondary" disabled={busy || saving} onClick={applyRepertoire}>Aplicar músicas ({selectedSongs.length})</button></div></>}
    </fieldset>
    <FormError error={error} />
    <div className="form-actions"><button type="button" className="button button-secondary" disabled={saving || busy} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={saving || busy}>{saving ? 'Salvando…' : 'Salvar culto'}</button></div>
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
  const types = serviceTypeSuggestions(data.services);
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
    {editing && <Modal wide title={data.services.some(service => service.id === editing.id) ? 'Editar culto' : 'Novo culto'} onClose={() => { if (!busy) setEditing(null); }}><ServiceForm initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={async service => { await saveService(service); setEditing(null); }} /></Modal>}
  </>;
}
