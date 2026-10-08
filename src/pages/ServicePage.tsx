import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Clock3, Copy, ExternalLink, GripVertical, Music2, Pencil, Trash2, Users, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { useDraft } from '../hooks/useDraft';
import { KEYS } from '../lib/music';
import { validateService } from '../lib/validation';
import type { Assignment, Person, Service, SetlistItem, Song } from '../types';
import { formatServiceDate, mergeTeamAssignments, previousTeamService, RepertoirePicker, restoreTeamPickerDraft, selectedRepertoireItems, selectedTeamAssignments, ServiceForm, TeamPicker, teamPickerFromAssignments, type RepertoirePickerDraft, type TeamPickerDraft } from './ServicesPage';
import './services.css';

type Dialog = 'edit' | 'team' | 'song' | 'delete' | null;

function BulkTeamForm({ service, services, people, busy, error, onSave, onCancel }: { service: Service; services: Service[]; people: Person[]; busy: boolean; error: string | null; onSave: (assignments: Assignment[]) => Promise<boolean>; onCancel: () => void }) {
  const currentTeam = teamPickerFromAssignments(service.assignments);
  const { draft: storedDraft, setDraft, discardDraft, hasDraft } = useDraft<TeamPickerDraft>(`service:${service.id}:team`, { selection: currentTeam.selection, search: '' });
  const draft = restoreTeamPickerDraft(storedDraft, service, people);
  const assignments = selectedTeamAssignments(draft.selection, service, people, draft.additional, true);
  const previousService = previousTeamService(service, services);
  async function apply(next: Assignment[]) {
    if (busy) return;
    if (await onSave(next)) discardDraft();
  }
  return <form onSubmit={event => { event.preventDefault(); void apply(assignments); }}>
    <p className="muted">Marque quem vai participar e ajuste as funções. Desmarque uma pessoa para retirá-la. A equipe inteira será salva de uma vez.</p>
    {hasDraft && <p className="service-draft-status" role="status">Sua seleção está guardada nesta aba.</p>}
    {previousService && <div className="service-batch-copy"><div><strong>Comece pela última escala</strong><span>{previousService.type} · {formatServiceDate(previousService.date)}</span></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => setDraft(teamPickerFromAssignments(mergeTeamAssignments(assignments, previousService.assignments, people)))}><Copy size={15} /> Reutilizar última escala</button></div>}
    {people.length ? <TeamPicker service={service} people={people} value={draft} onChange={setDraft} editExisting disabled={busy} /> : <EmptyState title="Cadastre a equipe primeiro" description="Pessoas e suas funções precisam estar cadastradas antes de montar a escala." action={<Link className="button button-primary" to="/pessoas">Ir para equipe</Link>} />}
    <FormError error={error} />
    <div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar equipe'}</button></div>
  </form>;
}

function RepertoireItemForm({ serviceId, initial, busy, error, onSave, onCancel }: { serviceId: string; initial: SetlistItem; busy: boolean; error: string | null; onSave: (item: SetlistItem) => Promise<boolean>; onCancel: () => void }) {
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<SetlistItem>(`service:${serviceId}:item:${initial.id}`, initial);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (await onSave({ ...draft, notes: draft.notes.trim() })) discardDraft();
  }
  return <form onSubmit={submit}><p className="muted">Estes ajustes valem apenas para este culto.</p>{hasDraft && <p className="service-draft-status" role="status">Rascunho guardado nesta aba.</p>}<div className="form-grid"><label className="field service-form-full"><span>Tom neste culto</span><select value={draft.key} disabled={busy} onChange={event => setDraft({ ...draft, key: event.target.value })}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label><label className="field service-form-full"><span>Observação <span className="muted">(opcional)</span></span><textarea rows={4} placeholder="Introdução, repetições, dinâmica…" value={draft.notes} disabled={busy} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label></div><FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar ajustes'}</button></div></form>;
}

function BulkRepertoireForm({ service, songs, busy, error, onSave, onCancel }: { service: Service; songs: Song[]; busy: boolean; error: string | null; onSave: (items: SetlistItem[]) => Promise<boolean>; onCancel: () => void }) {
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<RepertoirePickerDraft>(`service:${service.id}:repertoire`, { selection: [], search: '' });
  const remainingSongs = songs.filter(song => !service.repertoire.some(item => item.songId === song.id));
  const selected = [...new Set(draft.selection)].filter(id => remainingSongs.some(song => song.id === id));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const additions = selectedRepertoireItems(selected, service, songs);
    if (!additions.length) return;
    if (await onSave(additions)) discardDraft();
  }
  if (!remainingSongs.length) return <EmptyState title={songs.length ? 'Todas as músicas já foram adicionadas' : 'Sua biblioteca ainda está vazia'} description={songs.length ? 'Uma música aparece apenas uma vez neste repertório.' : 'Cadastre uma música para começar o repertório.'} action={<Link className="button button-secondary" to="/musicas">Ver biblioteca</Link>} />;
  return <form onSubmit={submit}><p className="muted">Marque todas as músicas que vão participar. Elas serão adicionadas de uma vez, com o tom usado na igreja.</p>{hasDraft && <p className="service-draft-status">Sua seleção está guardada nesta aba.</p>}<RepertoirePicker service={service} songs={songs} value={draft} onChange={setDraft} disabled={busy} /><FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={busy || !selected.length}>{busy ? 'Salvando…' : `Adicionar selecionadas (${selected.length})`}</button></div></form>;
}

export default function ServicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, canPlan, busy, error, saveService, deleteService } = useMinistry();
  const service = data.services.find(item => item.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [editingItem, setEditingItem] = useState<SetlistItem | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const disabled = busy || saving;

  if (!service) return <><Link to="/cultos" className="service-back"><ArrowLeft size={17} /> Voltar aos cultos</Link><EmptyState title="Culto não encontrado" description="Este culto pode ter sido removido. Consulte a lista de cultos." action={<Link to="/cultos" className="button button-primary">Ver cultos</Link>} /></>;

  const currentService = service;
  async function save(next: Service, close = false) {
    if (lock.current || busy) return false;
    const validationError = validateService(next, data);
    if (validationError) { setActionError(validationError); return false; }
    lock.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await saveService(next);
      if (close) { setDialog(null); setEditingItem(null); }
      return true;
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : 'Não foi possível salvar a alteração. Tente novamente.'); return false; }
    finally { lock.current = false; setSaving(false); }
  }
  function open(next: Dialog) {
    setActionError(null);
    setDialog(next);
  }
  function close() {
    if (disabled) return;
    setDialog(null);
    setEditingItem(null);
    setActionError(null);
  }
  async function reorder(itemId: string, targetIndex: number) {
    const index = currentService.repertoire.findIndex(item => item.id === itemId);
    if (index < 0 || targetIndex < 0 || targetIndex >= currentService.repertoire.length || index === targetIndex || disabled) return;
    const repertoire = [...currentService.repertoire];
    const [moved] = repertoire.splice(index, 1);
    repertoire.splice(targetIndex, 0, moved);
    await save({ ...currentService, repertoire });
  }
  async function removeService() {
    if (lock.current || busy) return;
    lock.current = true;
    setSaving(true);
    setActionError(null);
    try { await deleteService(currentService.id); navigate('/cultos'); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : 'Não foi possível excluir o culto.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <>
    <Link to="/cultos" className="service-back"><ArrowLeft size={17} /> Voltar aos cultos</Link>
    <PageHeader eyebrow="DETALHES DO ENCONTRO" title={service.type} description={formatServiceDate(service.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} action={canPlan && <div className="service-header-actions"><button className="button button-secondary" onClick={() => open('edit')} disabled={disabled}><Pencil size={16} /> Editar culto</button><button className="icon-button service-delete" aria-label="Excluir culto" title="Excluir culto" onClick={() => open('delete')} disabled={disabled}><Trash2 size={18} /></button></div>} />
    <FormError error={actionError && !dialog && !editingItem ? actionError : null} /><FormError error={error} />
    <div className="card service-overview"><div className="service-overview-facts"><span><CalendarDays size={19} /> {formatServiceDate(service.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span><span><Clock3 size={19} /> {service.time}</span><span><Users size={19} /> {service.assignments.length} pessoas na escala</span><span><Music2 size={19} /> {service.repertoire.length} músicas</span></div>{service.notes && <div className="service-observations"><span className="eyebrow">OBSERVAÇÕES DO CULTO</span><p>{service.notes}</p></div>}</div>
    <div className="service-columns">
      <section className="card service-repertoire"><div className="service-section-heading"><div><span className="service-section-icon"><Music2 size={20} /></span><h2>Repertório <span>{service.repertoire.length}</span></h2></div>{canPlan && <button className="button button-secondary" onClick={() => open('song')} disabled={disabled}><Music2 size={16} /> <span>Selecionar músicas</span></button>}</div>
        {service.repertoire.length ? <><p className="service-section-description">{canPlan ? 'Organize a sequência e prepare o tom de cada música.' : 'Abra uma música para acompanhar a letra e a cifra.'}</p><ol className="service-setlist">{service.repertoire.map((item, index) => {
          const song = data.songs.find(candidate => candidate.id === item.songId);
          return <li key={item.id} className={`service-setlist-item ${dragging === item.id ? 'service-dragging' : ''} ${dropTarget === item.id ? 'service-drop-target' : ''}`} draggable={canPlan && !disabled} onDragStart={event => { if (!canPlan || disabled) { event.preventDefault(); return; } event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; setDragging(item.id); }} onDragOver={event => { if (!canPlan || disabled || !dragging || dragging === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(item.id); }} onDragLeave={() => setDropTarget(null)} onDrop={event => { event.preventDefault(); const draggedId = event.dataTransfer.getData('text/plain'); setDropTarget(null); setDragging(null); if (canPlan && draggedId && currentService.repertoire.some(candidate => candidate.id === draggedId)) void reorder(draggedId, index); }} onDragEnd={() => { setDragging(null); setDropTarget(null); }}>
            <div className="service-item-position">{canPlan && <GripVertical size={16} className="service-drag-handle" aria-hidden="true" />}<span>{String(index + 1).padStart(2, '0')}</span></div><div className="service-item-main"><Link to={`/musicas/${item.songId}?service=${service.id}&item=${item.id}`} className="service-item-title"><span>{song?.title || 'Música indisponível'}</span> <ExternalLink size={13} /></Link><p className="service-item-artist">{song?.artist || 'Consulte a biblioteca'}</p>{item.notes && <p className="service-item-note">{item.notes}</p>}<div className="service-item-bottom"><span className="service-key">Tom {item.key}</span>{canPlan && <div className="service-item-actions"><button className="icon-button" disabled={disabled || index === 0} aria-label={`Mover ${song?.title || 'música'} para cima`} onClick={() => void reorder(item.id, index - 1)}><ArrowUp size={16} /></button><button className="icon-button" disabled={disabled || index === service.repertoire.length - 1} aria-label={`Mover ${song?.title || 'música'} para baixo`} onClick={() => void reorder(item.id, index + 1)}><ArrowDown size={16} /></button><button className="icon-button" disabled={disabled} aria-label={`Editar tom e observação de ${song?.title || 'música'}`} onClick={() => { setActionError(null); setEditingItem({ ...item }); }}><Pencil size={15} /></button><button className="icon-button" disabled={disabled} aria-label={`Remover ${song?.title || 'música'} do repertório`} onClick={() => void save({ ...currentService, repertoire: currentService.repertoire.filter(candidate => candidate.id !== item.id) })}><X size={17} /></button></div>}</div></div>
          </li>;
        })}</ol></> : <EmptyState title="O repertório está em branco" description={canPlan ? 'Selecione todas as músicas que vão conduzir este encontro.' : 'As músicas aparecerão aqui quando o repertório estiver pronto.'} />}
      </section>
      <section className="card service-team"><div className="service-section-heading"><div><span className="service-section-icon"><Users size={20} /></span><h2>Equipe <span>{service.assignments.length}</span></h2></div></div>
        {service.assignments.length ? <><p className="service-section-description">Juntos, servimos melhor.</p><ul className="service-team-list">{service.assignments.map(assignment => {
          const person = data.people.find(candidate => candidate.id === assignment.personId);
          return <li key={assignment.id}><span className="service-avatar">{(person?.name || '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span><div><strong>{person?.name || 'Pessoa indisponível'}</strong><span>{assignment.function}</span></div>{canPlan && <button className="icon-button" disabled={disabled} aria-label={`Remover ${person?.name || 'pessoa'} da função ${assignment.function}`} onClick={() => void save({ ...currentService, assignments: currentService.assignments.filter(candidate => candidate.id !== assignment.id) })}><X size={17} /></button>}</li>;
        })}</ul></> : <EmptyState title="Vamos reunir a equipe" description={canPlan ? 'Selecione todas as pessoas e suas funções para este culto.' : 'A escala aparecerá aqui quando estiver pronta.'} />}
        {canPlan && <button className="button button-secondary service-team-batch" onClick={() => open('team')} disabled={disabled}><Users size={16} /> {service.assignments.length ? 'Editar equipe' : 'Selecionar equipe'}</button>}
      </section>
    </div>
    {dialog === 'edit' && <Modal wide title="Editar culto" onClose={close}><ServiceForm initial={service} busy={disabled} onCancel={close} onSave={async next => { await saveService(next); setDialog(null); }} /></Modal>}
    {dialog === 'song' && <Modal wide title="Selecionar músicas para o repertório" onClose={close}><BulkRepertoireForm service={service} songs={data.songs} busy={disabled} error={actionError} onCancel={close} onSave={items => save({ ...currentService, repertoire: [...currentService.repertoire, ...items] }, true)} /></Modal>}
    {editingItem && <Modal title="Tom e observação do repertório" onClose={close}><RepertoireItemForm serviceId={service.id} initial={editingItem} busy={disabled} error={actionError} onCancel={close} onSave={edited => save({ ...currentService, repertoire: currentService.repertoire.map(item => item.id === edited.id ? edited : item) }, true)} /></Modal>}
    {dialog === 'team' && <Modal wide title={service.assignments.length ? 'Editar equipe' : 'Selecionar equipe'} onClose={close}><BulkTeamForm service={service} services={data.services} people={data.people} busy={disabled} error={actionError} onCancel={close} onSave={assignments => save({ ...currentService, assignments }, true)} /></Modal>}
    {dialog === 'delete' && <Modal title="Excluir este culto?" onClose={close}><p>A escala e o repertório de <strong>{service.type}</strong>, em {formatServiceDate(service.date)}, serão removidos. As músicas e as pessoas continuam cadastradas.</p><FormError error={actionError} /><div className="form-actions"><button className="button button-secondary" disabled={disabled} onClick={close}>Cancelar</button><button className="button button-primary service-delete-confirm" disabled={disabled} onClick={() => void removeService()}>{saving ? 'Excluindo…' : 'Excluir culto'}</button></div></Modal>}
  </>;
}
