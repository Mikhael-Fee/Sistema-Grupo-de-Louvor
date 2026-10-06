import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ListFilter, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { KEYS, normalizeSearch } from '../lib/music';
import { validateSong } from '../lib/validation';
import type { Song } from '../types';
import './songs.css';

function blankSong(): Song {
  return { id: crypto.randomUUID(), title: '', artist: '', originalKey: 'C', churchKey: 'C', content: '', youtubeUrl: '', notes: '', tagIds: [] };
}

export function SongEditor({ song, onClose }: { song?: Song; onClose: () => void }) {
  const { data, saveSong, busy } = useMinistry();
  const [draft, setDraft] = useState<Song>(() => song ? { ...song, tagIds: [...song.tagIds] } : blankSong());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const change = (field: keyof Song, value: string) => setDraft(current => ({ ...current, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = { ...draft, title: draft.title.trim(), artist: draft.artist.trim(), youtubeUrl: draft.youtubeUrl.trim(), notes: draft.notes.trim() };
    const invalid = validateSong(cleaned);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setSaving(true);
    try { await saveSong(cleaned); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a música. Tente novamente.'); }
    finally { setSaving(false); }
  }

  return <Modal title={song ? 'Editar música' : 'Nova música'} onClose={onClose} wide>
    <form onSubmit={submit} className="songs-editor">
      <p className="muted songs-editor-intro">Uma boa biblioteca deixa a preparação mais leve. Organize a letra, a cifra e os tons em um só lugar.</p>
      <div className="form-grid">
        <label className="field">Título<input autoFocus required value={draft.title} onChange={e => change('title', e.target.value)} placeholder="Nome da música" maxLength={200} /></label>
        <label className="field">Artista / compositor<input required value={draft.artist} onChange={e => change('artist', e.target.value)} placeholder="Quem compôs ou interpreta" maxLength={200} /></label>
        <label className="field">Tom original<select value={draft.originalKey} onChange={e => change('originalKey', e.target.value)}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
        <label className="field">Tom na igreja<select value={draft.churchKey} onChange={e => change('churchKey', e.target.value)}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
      </div>
      <label className="field">Letra e cifra<textarea className="songs-content-input" required rows={9} value={draft.content} onChange={e => change('content', e.target.value)} placeholder={'[C]Tua luz nos [G]guia\n[Am]Seguimos em [F]paz'} /><span className="songs-field-hint">Escreva os acordes entre colchetes, no tom original: [C], [Am7], [G/B]. Os demais trechos ficam como letra.</span></label>
      <label className="field">Vídeo no YouTube <span className="songs-optional">opcional</span><input type="url" value={draft.youtubeUrl} onChange={e => change('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <label className="field">Observações gerais <span className="songs-optional">opcional</span><textarea rows={3} value={draft.notes} onChange={e => change('notes', e.target.value)} placeholder="Introdução, dinâmica, andamento ou outras orientações" /></label>
      <fieldset className="songs-tags-field"><legend>Etiquetas</legend>{data.tags.length ? <div className="chips">{data.tags.map(tag => {
        const selected = draft.tagIds.includes(tag.id);
        return <button key={tag.id} type="button" className={`chip ${selected ? 'active' : ''}`} aria-pressed={selected} onClick={() => setDraft(current => ({ ...current, tagIds: selected ? current.tagIds.filter(id => id !== tag.id) : [...current.tagIds, tag.id] }))}>{selected && <Check size={13} />}<span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</button>;
      })}</div> : <p className="muted">Cadastre etiquetas na seção Etiquetas para organizar as músicas.</p>}</fieldset>
      <FormError error={error} />
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || busy}>{saving ? 'Salvando…' : 'Salvar música'}</button></div>
    </form>
  </Modal>;
}

export default function SongsPage() {
  const { data, canEditLibrary, deleteSong, busy, error } = useMinistry();
  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editor, setEditor] = useState<Song | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const songs = useMemo(() => data.songs.filter(song => {
    const matchesQuery = normalizeSearch(`${song.title} ${song.artist}`).includes(normalizeSearch(query).trim());
    return matchesQuery && (!keyFilter || song.churchKey === keyFilter) && selectedTags.every(id => song.tagIds.includes(id));
  }).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [data.songs, query, keyFilter, selectedTags]);
  const filtered = Boolean(query || keyFilter || selectedTags.length);
  const reset = () => { setQuery(''); setKeyFilter(''); setSelectedTags([]); };
  const usedBy = deleting ? data.services.filter(service => service.repertoire.some(item => item.songId === deleting.id)).length : 0;

  async function removeSong() {
    if (!deleting) return;
    setRemoving(true);
    setDeleteError(null);
    try { await deleteSong(deleting.id); setDeleting(null); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Não foi possível excluir a música.'); }
    finally { setRemoving(false); }
  }

  return <>
    <PageHeader eyebrow="REPERTÓRIO DO MINISTÉRIO" title="Biblioteca de músicas" description="Cada canção, pronta para o próximo encontro." action={canEditLibrary && <button className="button button-primary" onClick={() => setEditor('new')}><Plus size={17} />Nova música</button>} />
    <div className="songs-summary"><span className="songs-summary-icon"><Music2 size={19} /></span><strong>{data.songs.length}</strong><span>{data.songs.length === 1 ? 'música na biblioteca' : 'músicas na biblioteca'}</span><span className="songs-summary-divider" /><span>{data.tags.length} {data.tags.length === 1 ? 'etiqueta para organizar' : 'etiquetas para organizar'}</span></div>
    <section className="card songs-filters" aria-label="Filtros de músicas">
      <div className="songs-filter-row"><label className="songs-search"><Search size={18} /><input className="search-input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por título ou artista…" aria-label="Buscar por título ou artista" /></label><label className="songs-key-filter"><ListFilter size={16} /><span className="sr-only">Filtrar pelo tom na igreja</span><select value={keyFilter} onChange={e => setKeyFilter(e.target.value)} aria-label="Filtrar pelo tom na igreja"><option value="">Todos os tons</option>{KEYS.map(key => <option key={key} value={key}>Tom {key}</option>)}</select></label></div>
      {data.tags.length > 0 && <div className="songs-filter-tags"><span className="songs-filter-label">ETIQUETAS</span><div className="chips">{data.tags.map(tag => {
        const active = selectedTags.includes(tag.id);
        return <button key={tag.id} className={`chip ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => setSelectedTags(current => active ? current.filter(id => id !== tag.id) : [...current, tag.id])}>{active && <Check size={13} />}<span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</button>;
      })}</div></div>}
    </section>
    <div className="songs-results-heading"><p>{songs.length === data.songs.length ? 'Todas as músicas' : `${songs.length} ${songs.length === 1 ? 'música encontrada' : 'músicas encontradas'}`}<span>{songs.length}</span></p>{filtered && <button className="button button-ghost songs-clear" onClick={reset}><X size={14} />Limpar filtros</button>}</div>
    <FormError error={error} />
    {songs.length ? <div className="card songs-list"><div className="songs-list-head" aria-hidden="true"><span>MÚSICA</span><span>TOM NA IGREJA</span><span>ETIQUETAS</span><span /></div>{songs.map(song => <article className="songs-row" key={song.id}>
      <Link className="songs-name" to={`/musicas/${song.id}`}><span className="songs-cover"><Music2 size={22} /></span><span><strong>{song.title}</strong><small>{song.artist}</small></span></Link>
      <div className="songs-key"><span className="songs-key-badge">{song.churchKey}</span><small>Original: {song.originalKey}</small></div>
      <div className="songs-row-tags">{data.tags.filter(tag => song.tagIds.includes(tag.id)).map(tag => <span key={tag.id} className="songs-tag"><span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</span>)}{!song.tagIds.length && <span className="muted songs-no-tags">Sem etiquetas</span>}</div>
      <div className="songs-row-actions">{canEditLibrary && <><button className="icon-button" aria-label={`Editar ${song.title}`} title="Editar música" onClick={() => setEditor(song)}><Pencil size={16} /></button><button className="icon-button songs-delete" aria-label={`Excluir ${song.title}`} title="Excluir música" onClick={() => { setDeleting(song); setDeleteError(null); }}><Trash2 size={16} /></button></>}<Link className="icon-button songs-open" to={`/musicas/${song.id}`} aria-label={`Abrir ${song.title}`}><ArrowUpRight size={19} /></Link></div>
    </article>)}</div> : <div className="card"><EmptyState title={filtered ? 'Nenhuma música com esses filtros' : 'A biblioteca começa com uma canção'} description={filtered ? 'Tente outro título, tom ou combinação de etiquetas.' : 'Adicione as músicas que fazem parte da caminhada do ministério.'} action={filtered ? <button className="button button-secondary" onClick={reset}>Limpar filtros</button> : canEditLibrary ? <button className="button button-primary" onClick={() => setEditor('new')}><Plus size={16} />Adicionar música</button> : undefined} /></div>}
    <p className="songs-footer-note"><Music2 size={14} />Os ajustes de tom na visualização preservam a música original.</p>
    {editor && <SongEditor song={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {deleting && <Modal title="Excluir música" onClose={() => setDeleting(null)}><p>Excluir <strong>{deleting.title}</strong> da biblioteca?</p>{usedBy > 0 ? <p className="songs-delete-warning">Esta música aparece em {usedBy} {usedBy === 1 ? 'culto' : 'cultos'}. Remova-a dos repertórios antes de excluir.</p> : <p className="muted">Esta ação remove a letra, a cifra e as observações cadastradas.</p>}<FormError error={deleteError} /><div className="form-actions"><button className="button button-secondary" onClick={() => setDeleting(null)}>Cancelar</button><button className="button songs-danger-button" disabled={usedBy > 0 || removing || busy} onClick={removeSong}>{removing ? 'Excluindo…' : 'Excluir música'}</button></div></Modal>}
  </>;
}
