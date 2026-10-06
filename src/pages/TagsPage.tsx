import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
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

export default function TagsPage() {
  const { data, canEditLibrary, saveTag, deleteTag } = useMinistry();
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canEditLibrary) return;
    const tag = { ...editing, name: editing.name.trim() };
    const validation = validateTag(tag);
    if (validation) { setError(validation); return; }
    if (data.tags.some(existing => existing.id !== tag.id && existing.name.toLocaleLowerCase('pt-BR') === tag.name.toLocaleLowerCase('pt-BR'))) { setError('Já existe uma etiqueta com esse nome.'); return; }
    setSaving(true); setError(null);
    try { await saveTag(tag); setEditing(null); }
    catch (err) { setError(readableError(err)); }
    finally { setSaving(false); }
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
    {editing && <Modal title={data.tags.some(tag => tag.id === editing.id) ? 'Editar etiqueta' : 'Nova etiqueta'} onClose={() => { if (!saving) setEditing(null); }}><form className="form-grid" onSubmit={submit}>
      <label className="field">Nome<input autoFocus required maxLength={60} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="Ex.: Adoração, Ceia, Jovens" /></label>
      <fieldset className="tags-color-field"><legend>Cor da etiqueta</legend><div className="tags-colors">{COLORS.map(color => <label key={color.value} className="tags-color-choice" title={color.name}><input type="radio" name="tag-color" value={color.value} checked={editing.color.toLowerCase() === color.value} onChange={() => setEditing({ ...editing, color: color.value })} aria-label={color.name} /><span style={{ backgroundColor: color.value }} /></label>)}</div></fieldset>
      <div className="tags-preview"><span className="muted">Prévia</span><span className="tags-preview-label"><span className="tags-dot" style={{ backgroundColor: editing.color }} />{editing.name.trim() || 'Nova etiqueta'}</span></div>
      <FormError error={error} /><div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar etiqueta'}</button></div>
    </form></Modal>}
    {removing && <Modal title="Excluir etiqueta" onClose={() => { if (!saving) setRemoving(null); }}><p>Excluir a etiqueta <strong>{removing.name}</strong>?</p><p className="muted">{songCount(removing.id) ? `Ela será removida de ${songCount(removing.id)} ${songCount(removing.id) === 1 ? 'música' : 'músicas'}. As músicas serão preservadas.` : 'Esta ação não pode ser desfeita.'}</p><FormError error={error} /><div className="form-actions"><button className="button button-secondary" disabled={saving} onClick={() => setRemoving(null)}>Cancelar</button><button className="button people-danger-button" disabled={saving} onClick={remove}>{saving ? 'Excluindo…' : 'Excluir etiqueta'}</button></div></Modal>}
  </>;
}
