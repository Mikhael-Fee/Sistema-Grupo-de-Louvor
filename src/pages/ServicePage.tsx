import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Clock3, ExternalLink, GripVertical, Music2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { KEYS } from '../lib/music';
import { validateService } from '../lib/validation';
import type { Service, SetlistItem } from '../types';
import { formatServiceDate, ServiceForm } from './ServicesPage';
import './services.css';

type Dialog = 'edit' | 'person' | 'song' | 'delete' | null;

export default function ServicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, canPlan, busy, error, saveService, deleteService } = useMinistry();
  const service = data.services.find(item => item.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [personId, setPersonId] = useState('');
  const [personFunction, setPersonFunction] = useState('');
  const [songId, setSongId] = useState('');
  const [songSearch, setSongSearch] = useState('');
  const [editingItem, setEditingItem] = useState<SetlistItem | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const disabled = busy || saving;
  const selectedPerson = data.people.find(person => person.id === personId);
  const availableSongs = data.songs.filter(song => !service?.repertoire.some(item => item.songId === song.id) && `${song.title} ${song.artist}`.toLocaleLowerCase('pt-BR').includes(songSearch.trim().toLocaleLowerCase('pt-BR')));

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
    setPersonId('');
    setPersonFunction('');
    setSongId('');
    setSongSearch('');
    setDialog(next);
  }
  function close() {
    if (disabled) return;
    setDialog(null);
    setEditingItem(null);
    setActionError(null);
  }
  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (!selectedPerson || !selectedPerson.functions.includes(personFunction)) { setActionError('Selecione uma pessoa e uma das funções cadastradas para ela.'); return; }
    if (currentService.assignments.some(item => item.personId === personId && item.function === personFunction)) { setActionError('Esta pessoa já está escalada nessa função.'); return; }
    await save({ ...currentService, assignments: [...currentService.assignments, { id: crypto.randomUUID(), personId, function: personFunction }] }, true);
  }
  async function addSong(event: FormEvent) {
    event.preventDefault();
    const song = data.songs.find(item => item.id === songId);
    if (!song || currentService.repertoire.some(item => item.songId === songId)) { setActionError('Selecione uma música que ainda não esteja no repertório.'); return; }
    await save({ ...currentService, repertoire: [...currentService.repertoire, { id: crypto.randomUUID(), songId, key: song.churchKey || song.originalKey, notes: '' }] }, true);
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
      <section className="card service-repertoire"><div className="service-section-heading"><div><span className="service-section-icon"><Music2 size={20} /></span><h2>Repertório <span>{service.repertoire.length}</span></h2></div>{canPlan && <button className="button button-secondary" onClick={() => open('song')} disabled={disabled}><Plus size={16} /> <span>Adicionar música</span></button>}</div>
        {service.repertoire.length ? <><p className="service-section-description">{canPlan ? 'Organize a sequência e prepare o tom de cada música.' : 'Abra uma música para acompanhar a letra e a cifra.'}</p><ol className="service-setlist">{service.repertoire.map((item, index) => {
          const song = data.songs.find(candidate => candidate.id === item.songId);
          return <li key={item.id} className={`service-setlist-item ${dragging === item.id ? 'service-dragging' : ''} ${dropTarget === item.id ? 'service-drop-target' : ''}`} draggable={canPlan && !disabled} onDragStart={event => { if (!canPlan || disabled) { event.preventDefault(); return; } event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; setDragging(item.id); }} onDragOver={event => { if (!canPlan || disabled || !dragging || dragging === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(item.id); }} onDragLeave={() => setDropTarget(null)} onDrop={event => { event.preventDefault(); const draggedId = event.dataTransfer.getData('text/plain'); setDropTarget(null); setDragging(null); if (canPlan && draggedId && currentService.repertoire.some(candidate => candidate.id === draggedId)) void reorder(draggedId, index); }} onDragEnd={() => { setDragging(null); setDropTarget(null); }}>
            <div className="service-item-position">{canPlan && <GripVertical size={16} className="service-drag-handle" aria-hidden="true" />}<span>{String(index + 1).padStart(2, '0')}</span></div><div className="service-item-main"><Link to={`/musicas/${item.songId}?service=${service.id}&item=${item.id}`} className="service-item-title"><span>{song?.title || 'Música indisponível'}</span> <ExternalLink size={13} /></Link><p className="service-item-artist">{song?.artist || 'Consulte a biblioteca'}</p>{item.notes && <p className="service-item-note">{item.notes}</p>}<div className="service-item-bottom"><span className="service-key">Tom {item.key}</span>{canPlan && <div className="service-item-actions"><button className="icon-button" disabled={disabled || index === 0} aria-label={`Mover ${song?.title || 'música'} para cima`} onClick={() => void reorder(item.id, index - 1)}><ArrowUp size={16} /></button><button className="icon-button" disabled={disabled || index === service.repertoire.length - 1} aria-label={`Mover ${song?.title || 'música'} para baixo`} onClick={() => void reorder(item.id, index + 1)}><ArrowDown size={16} /></button><button className="icon-button" disabled={disabled} aria-label={`Editar tom e observação de ${song?.title || 'música'}`} onClick={() => { setActionError(null); setEditingItem({ ...item }); }}><Pencil size={15} /></button><button className="icon-button" disabled={disabled} aria-label={`Remover ${song?.title || 'música'} do repertório`} onClick={() => void save({ ...currentService, repertoire: currentService.repertoire.filter(candidate => candidate.id !== item.id) })}><X size={17} /></button></div>}</div></div>
          </li>;
        })}</ol></> : <EmptyState title="O repertório está em branco" description={canPlan ? 'Escolha as músicas que vão conduzir este encontro.' : 'As músicas aparecerão aqui quando o repertório estiver pronto.'} action={canPlan && <button className="button button-secondary" onClick={() => open('song')} disabled={disabled}><Plus size={16} /> Escolher músicas</button>} />}
      </section>
      <section className="card service-team"><div className="service-section-heading"><div><span className="service-section-icon"><Users size={20} /></span><h2>Equipe <span>{service.assignments.length}</span></h2></div>{canPlan && <button className="icon-button" aria-label="Adicionar pessoa à escala" title="Adicionar pessoa" onClick={() => open('person')} disabled={disabled}><Plus size={21} /></button>}</div>
        {service.assignments.length ? <><p className="service-section-description">Juntos, servimos melhor.</p><ul className="service-team-list">{service.assignments.map(assignment => {
          const person = data.people.find(candidate => candidate.id === assignment.personId);
          return <li key={assignment.id}><span className="service-avatar">{(person?.name || '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span><div><strong>{person?.name || 'Pessoa indisponível'}</strong><span>{assignment.function}</span></div>{canPlan && <button className="icon-button" disabled={disabled} aria-label={`Remover ${person?.name || 'pessoa'} da função ${assignment.function}`} onClick={() => void save({ ...currentService, assignments: currentService.assignments.filter(candidate => candidate.id !== assignment.id) })}><X size={17} /></button>}</li>;
        })}</ul>{canPlan && <button className="button button-ghost service-team-add" onClick={() => open('person')} disabled={disabled}><Plus size={16} /> Adicionar pessoa</button>}</> : <EmptyState title="Vamos reunir a equipe" description={canPlan ? 'Escale cada pessoa na sua função para este culto.' : 'A escala aparecerá aqui quando estiver pronta.'} action={canPlan && <button className="button button-secondary" onClick={() => open('person')} disabled={disabled}><Plus size={16} /> Montar escala</button>} />}
      </section>
    </div>
    {dialog === 'edit' && <Modal title="Editar culto" onClose={close}><ServiceForm initial={service} busy={disabled} onCancel={close} onSave={async next => { await saveService(next); setDialog(null); }} /></Modal>}
    {dialog === 'person' && <Modal title="Adicionar pessoa à escala" onClose={close}>{data.people.length ? <form onSubmit={addPerson}><div className="form-grid"><label className="field service-form-full"><span>Pessoa</span><select required value={personId} onChange={event => { setPersonId(event.target.value); const person = data.people.find(candidate => candidate.id === event.target.value); setPersonFunction(person?.functions[0] || ''); }}><option value="">Selecione uma pessoa</option>{[...data.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(person => <option key={person.id} value={person.id} disabled={!person.functions.length}>{person.name}</option>)}</select></label><label className="field service-form-full"><span>Função neste culto</span><select required value={personFunction} disabled={!selectedPerson} onChange={event => setPersonFunction(event.target.value)}><option value="">Selecione uma função</option>{selectedPerson?.functions.map(item => <option key={item}>{item}</option>)}</select></label></div><FormError error={actionError} /><div className="form-actions"><button type="button" className="button button-secondary" onClick={close} disabled={disabled}>Cancelar</button><button className="button button-primary" disabled={disabled || !personId || !personFunction}>{saving ? 'Salvando…' : 'Adicionar à escala'}</button></div></form> : <EmptyState title="Cadastre a equipe primeiro" description="Pessoas e suas funções precisam estar cadastradas antes de montar a escala." action={<Link className="button button-primary" to="/pessoas">Ir para equipe</Link>} />}</Modal>}
    {dialog === 'song' && <Modal title="Adicionar música ao repertório" onClose={close}>{data.songs.some(song => !service.repertoire.some(item => item.songId === song.id)) ? <form onSubmit={addSong}><label className="field"><span>Buscar na biblioteca</span><input placeholder="Título ou artista" value={songSearch} onChange={event => { setSongSearch(event.target.value); setSongId(''); }} /></label><div className="service-song-options">{availableSongs.map(song => <label key={song.id} className={`service-song-option ${songId === song.id ? 'service-song-selected' : ''}`}><input type="radio" name="song" value={song.id} checked={songId === song.id} onChange={() => setSongId(song.id)} required /><span><strong>{song.title}</strong><small>{song.artist}</small></span><span className="service-key">{song.churchKey || song.originalKey}</span></label>)}{!availableSongs.length && <p className="muted">Nenhuma música corresponde à busca.</p>}</div><FormError error={actionError} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={disabled} onClick={close}>Cancelar</button><button className="button button-primary" disabled={disabled || !songId}>{saving ? 'Salvando…' : 'Adicionar música'}</button></div></form> : <EmptyState title={data.songs.length ? 'Todas as músicas já foram adicionadas' : 'Sua biblioteca ainda está vazia'} description={data.songs.length ? 'Uma música aparece apenas uma vez neste repertório.' : 'Cadastre uma música para começar o repertório.'} action={<Link className="button button-secondary" to="/musicas">Ver biblioteca</Link>} />}</Modal>}
    {editingItem && <Modal title="Tom e observação do repertório" onClose={close}><form onSubmit={event => { event.preventDefault(); void save({ ...currentService, repertoire: currentService.repertoire.map(item => item.id === editingItem.id ? { ...editingItem, notes: editingItem.notes.trim() } : item) }, true); }}><p className="muted">Estes ajustes valem apenas para este culto. O cadastro da música será preservado.</p><div className="form-grid"><label className="field service-form-full"><span>Tom neste culto</span><select value={editingItem.key} onChange={event => setEditingItem({ ...editingItem, key: event.target.value })}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label><label className="field service-form-full"><span>Observação <span className="muted">(opcional)</span></span><textarea rows={4} placeholder="Introdução, repetições, dinâmica…" value={editingItem.notes} onChange={event => setEditingItem({ ...editingItem, notes: event.target.value })} /></label></div><FormError error={actionError} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={disabled} onClick={close}>Cancelar</button><button className="button button-primary" disabled={disabled}>{saving ? 'Salvando…' : 'Salvar ajustes'}</button></div></form></Modal>}
    {dialog === 'delete' && <Modal title="Excluir este culto?" onClose={close}><p>A escala e o repertório de <strong>{service.type}</strong>, em {formatServiceDate(service.date)}, serão removidos. As músicas e as pessoas continuam cadastradas.</p><FormError error={actionError} /><div className="form-actions"><button className="button button-secondary" disabled={disabled} onClick={close}>Cancelar</button><button className="button button-primary service-delete-confirm" disabled={disabled} onClick={() => void removeService()}>{saving ? 'Excluindo…' : 'Excluir culto'}</button></div></Modal>}
  </>;
}
