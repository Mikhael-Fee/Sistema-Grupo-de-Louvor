import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { useDraft } from '../hooks/useDraft';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { validateTag } from '../lib/validation';
import { normalizeSearch } from '../lib/music';
import type { Tag } from '../types';
import './people.css';

const COLORS = [
  { value: '#628368', name: 'Verde' }, { value: '#b48649', name: 'Dourado' },
  { value: '#648aa2', name: 'Azul' }, { value: '#9274a1', name: 'Lilás' },
  { value: '#c17777', name: 'Rosa' }, { value: '#a37659', name: 'Terracota' },
  { value: '#55938d', name: 'Turquesa' }, { value: '#7d8591', name: 'Cinza' },
];
const readableError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';

function TagForm({ initial, onSaved, onCancel }: { initial: Tag; onSaved: () => void; onCancel: () => void }) {
  const { data, canEditLibrary, busy, saveTag } = useMinistry();
  const existing = data.tags.some(tag => tag.id === initial.id);
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<Tag>(`tag:${existing ? initial.id : 'new'}`, initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const disabled = saving || busy;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditLibrary || lock.current || busy) return;
    const tag = { ...draft, name: draft.name.trim() };
    const validation = validateTag(tag);
    if (validation) { setError(validation); return; }
    if (data.tags.some(existing => existing.id !== tag.id && existing.name.trim().toLocaleLowerCase('pt-BR') === tag.name.toLocaleLowerCase('pt-BR'))) { setError('Já existe uma etiqueta com esse nome.'); return; }
    lock.current = true;
    setSaving(true);
    setError(null);
    try { await saveTag(tag); discardDraft(); onSaved(); }
    catch (err) { setError(readableError(err)); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form className="form-grid" onSubmit={submit}>
    {hasDraft && <p className="muted" role="status" style={{ gridColumn: '1 / -1', fontSize: 12 }}>Rascunho guardado nesta aba. Você pode sair e continuar depois.</p>}
    <label className="field">Nome<input autoFocus required maxLength={60} disabled={disabled} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Adoração, Ceia, Jovens" /></label>
    <fieldset className="tags-color-field"><legend>Cor da etiqueta</legend><div className="tags-colors">{COLORS.map(color => <label key={color.value} className="tags-color-choice" title={color.name}><input type="radio" name="tag-color" value={color.value} disabled={disabled} checked={draft.color.toLowerCase() === color.value} onChange={() => setDraft({ ...draft, color: color.value })} aria-label={color.name} /><span style={{ backgroundColor: color.value }} /></label>)}</div></fieldset>
    <div className="tags-preview"><span className="muted">Prévia</span><span className="tags-preview-label"><span className="tags-dot" style={{ backgroundColor: draft.color }} />{draft.name.trim() || 'Nova etiqueta'}</span></div>
    <FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={disabled} onClick={() => { discardDraft(); onCancel(); }}>Cancelar</button><button className="button button-primary" disabled={disabled}>{saving ? 'Salvando…' : 'Salvar etiqueta'}</button></div>
  </form>;
}

export default function TagsPage() {
  const { data, canEditLibrary, busy, deleteTag } = useMinistry();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Tag | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tags = useMemo(() => data.tags.filter(tag => normalizeSearch(tag.name).includes(normalizeSearch(query.trim()))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.tags, query]);
  const songCount = (tagId: string) => data.songs.filter(song => song.tagIds.includes(tagId)).length;

  function openEditor(tag?: Tag) {
    setError(null);
    setEditing(tag ? { ...tag } : { id: crypto.randomUUID(), name: '', color: COLORS[0].value });
  }

  async function remove() {
    if (!removing || !canEditLibrary) return;
    setSaving(true); setError(null);
    try { await deleteTag(removing.id); setRemoving(null); }
    catch (err) { setError(readableError(err)); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Uma biblioteca bem organizada" title="Etiquetas" description="Encontre a música certa para cada momento do culto." action={canEditLibrary && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Nova etiqueta</button>} />
    <div className="tags-tip card"><span className="people-summary-icon"><Tags size={22} /></span><div><strong>Uma música, muitos momentos</strong><p className="muted">Combine etiquetas como Adoração e Ceia para encontrar músicas com as duas características.</p></div></div>
    <div className="toolbar"><label className="people-search"><Search size={18} aria-hidden="true" /><span className="people-sr-only">Buscar etiquetas</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar etiqueta…" /></label><span className="muted tags-total">{data.tags.length} {data.tags.length === 1 ? 'etiqueta' : 'etiquetas'}</span></div>
    {tags.length ? <div className="tags-grid">{tags.map(tag => { const count = songCount(tag.id); return <article className="tags-card card" key={tag.id}><span className="tags-dot" style={{ backgroundColor: tag.color }} aria-hidden="true" /><div className="tags-card-info"><h2>{tag.name}</h2><p className="muted">{count} {count === 1 ? 'música' : 'músicas'}</p></div>{canEditLibrary && <div className="tags-card-actions"><button className="icon-button" onClick={() => openEditor(tag)} aria-label={`Editar etiqueta ${tag.name}`}><Pencil size={16} /></button><button className="icon-button" onClick={() => { setError(null); setRemoving(tag); }} aria-label={`Excluir etiqueta ${tag.name}`}><Trash2 size={16} /></button></div>}</article>; })}</div> : <EmptyState title={data.tags.length ? 'Nenhuma etiqueta encontrada' : 'Dê um sentido ao repertório'} description={data.tags.length ? 'Experimente outro termo de busca.' : 'Crie etiquetas para temas, celebrações e momentos do culto.'} action={canEditLibrary && !data.tags.length && <button className="button button-primary" onClick={() => openEditor()}><Plus size={18} /> Criar etiqueta</button>} />}
    {editing && <Modal title={data.tags.some(tag => tag.id === editing.id) ? 'Editar etiqueta' : 'Nova etiqueta'} onClose={() => { if (!saving && !busy) setEditing(null); }}><TagForm initial={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} /></Modal>}
    {removing && <Modal title="Excluir etiqueta" onClose={() => { if (!saving) setRemoving(null); }}><p>Excluir a etiqueta <strong>{removing.name}</strong>?</p><p className="muted">{songCount(removing.id) ? `Ela será removida de ${songCount(removing.id)} ${songCount(removing.id) === 1 ? 'música' : 'músicas'}. As músicas serão preservadas.` : 'Esta ação não pode ser desfeita.'}</p><FormError error={error} /><div className="form-actions"><button className="button button-secondary" disabled={saving} onClick={() => setRemoving(null)}>Cancelar</button><button className="button people-danger-button" disabled={saving} onClick={remove}>{saving ? 'Excluindo…' : 'Excluir etiqueta'}</button></div></Modal>}
  </>;
}
