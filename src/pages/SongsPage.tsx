import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Download, ExternalLink, ListFilter, LoaderCircle, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { KEYS, normalizeSearch } from '../lib/music';
import { validateSong } from '../lib/validation';
import { normalizeCifraClubUrl, parseCifraClubText } from '../lib/cifraclub';
import { useDraft } from '../hooks/useDraft';
import { cifraClubSearchUrl, cifraClubUrlFromNotes, isSafeCifraClubUrl, notesWithCifraClubSource, previewSongSource, searchSongSources, sourceKey, type SongImportKind, type SongSearchResult } from '../lib/song-search';
import type { Song } from '../types';
import './songs.css';

function blankSong(): Song {
  return { id: crypto.randomUUID(), title: '', artist: '', originalKey: 'C', churchKey: 'C', content: '', youtubeUrl: '', notes: '', tagIds: [] };
}

export function SongEditor({ song, onClose }: { song?: Song; onClose: () => void }) {
  const { data, saveSong, busy } = useMinistry();
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<Song>(`song:${song?.id || 'new'}`, () => song ? { ...song, tagIds: [...song.tagIds] } : blankSong());
  const { draft: cifraClubUrl, setDraft: setCifraClubUrl, discardDraft: discardCifraClubDraft, hasDraft: hasCifraClubDraft } = useDraft<string>(`song-cifraclub:${song?.id || 'new'}`, () => cifraClubUrlFromNotes(draft.notes));
  const { draft: cifraClubText, setDraft: setCifraClubText, discardDraft: discardCifraTextDraft, hasDraft: hasCifraTextDraft } = useDraft<string>(`song-cifraclub-text:${song?.id || 'new'}`, '');
  const [cifraError, setCifraError] = useState<string | null>(null);
  const [cifraImported, setCifraImported] = useState(false);
  const [cifraConfirmReplace, setCifraConfirmReplace] = useState(false);
  const cifraPreview = useMemo(() => {
    if (!cifraClubText.trim()) return null;
    try { return parseCifraClubText(cifraClubText); }
    catch { return null; }
  }, [cifraClubText]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceKind, setSourceKind] = useState<SongImportKind>('chords');
  const [sourceResults, setSourceResults] = useState<SongSearchResult[]>([]);
  const [preview, setPreview] = useState<SongSearchResult | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [imported, setImported] = useState(false);
  const [useSourceMetadata, setUseSourceMetadata] = useState(false);
  const sourceRequest = useRef<AbortController | null>(null);
  useEffect(() => () => sourceRequest.current?.abort(), []);
  const change = (field: keyof Song, value: string) => setDraft(current => ({ ...current, [field]: value }));

  function importCifraClubText() {
    setCifraConfirmReplace(false);
    setCifraError(null);
    if (cifraClubUrl.trim() && !normalizeCifraClubUrl(cifraClubUrl.trim())) { setCifraError('Informe o link HTTPS de uma música no Cifra Club ou deixe o campo vazio.'); return; }
    try {
      const parsed = parseCifraClubText(cifraClubText);
      if (!parsed.content.trim()) { setCifraError('Cole a letra e cifra que você deseja importar.'); return; }
      setDraft(current => {
        const reference = 'Fonte da cifra: Cifra Club — texto colado pelo usuário';
        let notes = notesWithCifraClubSource(current.notes, cifraClubUrl);
        if (!cifraClubUrl.trim() && !notes.includes(reference)) notes = `${notes}${notes ? '\n\n' : ''}${reference}`;
        return { ...current, content: parsed.content, originalKey: parsed.originalKey || current.originalKey, notes };
      });
      if (cifraClubUrl.trim()) setCifraClubUrl(normalizeCifraClubUrl(cifraClubUrl.trim())!);
      setCifraImported(true);
    } catch (cause) { setCifraError(cause instanceof Error ? cause.message : 'Não foi possível converter o texto colado. Revise a cifra e tente novamente.'); }
  }

  async function searchOnline() {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    setSourceError(null); setPreview(null); setSourceResults([]); setSearching(true); setSearched(false); setImported(false);
    try { setSourceResults(await searchSongSources(draft.title, draft.artist, sourceKind, controller.signal)); setSearched(true); }
    catch (cause) { if (!controller.signal.aborted) setSourceError(cause instanceof Error ? cause.message : 'Não foi possível buscar a música.'); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }

  async function openPreview(result: SongSearchResult) {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    setPreviewing(result.id); setSourceError(null); setPreview(null); setImported(false); setUseSourceMetadata(false);
    try { setPreview(await previewSongSource(result, controller.signal)); }
    catch (cause) { if (!controller.signal.aborted) setSourceError(cause instanceof Error ? cause.message : 'Não foi possível abrir a prévia.'); }
    finally { if (!controller.signal.aborted) setPreviewing(null); }
  }

  function switchSource(kind: SongImportKind) {
    sourceRequest.current?.abort(); setSourceKind(kind); setSourceResults([]); setPreview(null); setSourceError(null); setSearched(false); setSearching(false); setPreviewing(null); setImported(false);
  }

  function importPreview() {
    if (!preview?.content) return;
    const key = sourceKey(preview.originalKey);
    if (preview.kind === 'chords' && !key) { setSourceError('A fonte não informou um tom original reconhecido. Revise a cifra manualmente antes de cadastrá-la.'); return; }
    const attribution = `Fonte ${preview.kind === 'chords' ? 'da letra e cifra' : 'da letra'}: ${preview.source} — ${preview.sourceUrl}`;
    setDraft(current => ({ ...current, content: preview.content!, originalKey: key || current.originalKey, ...(useSourceMetadata ? { title: preview.title, artist: preview.artist || current.artist } : {}), notes: current.notes.includes(attribution) ? current.notes : `${current.notes.trim()}${current.notes.trim() ? '\n\n' : ''}${attribution}` }));
    setPreview(null); setImported(true); setSourceError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cifraClubUrl.trim() && !isSafeCifraClubUrl(cifraClubUrl.trim())) { setError('Informe o link HTTPS de uma música no Cifra Club ou deixe o campo vazio.'); return; }
    const cleaned = { ...draft, title: draft.title.trim(), artist: draft.artist.trim(), youtubeUrl: draft.youtubeUrl.trim(), notes: notesWithCifraClubSource(draft.notes, cifraClubUrl) };
    const invalid = validateSong(cleaned);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setSaving(true);
    try { await saveSong(cleaned); discardDraft(); discardCifraClubDraft(); discardCifraTextDraft(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a música. Tente novamente.'); }
    finally { setSaving(false); }
  }

  return <Modal title={song ? 'Editar música' : 'Nova música'} onClose={onClose} wide>
    <form onSubmit={submit} className="songs-editor">
      <p className="muted songs-editor-intro">Uma boa biblioteca deixa a preparação mais leve. Organize a letra, a cifra e os tons em um só lugar.</p>
      {(hasDraft || hasCifraClubDraft || hasCifraTextDraft) && <p className="songs-draft-note" role="status"><Check size={14} />Rascunho salvo nesta aba. Fechar a janela mantém seus campos.</p>}
      <div className="form-grid">
        <label className="field">Título<input autoFocus required value={draft.title} onChange={e => change('title', e.target.value)} placeholder="Nome da música" maxLength={200} /></label>
        <label className="field">Artista / compositor<input required value={draft.artist} onChange={e => change('artist', e.target.value)} placeholder="Quem compôs ou interpreta" maxLength={200} /></label>
        <label className="field">Tom original<select value={draft.originalKey} onChange={e => change('originalKey', e.target.value)}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
        <label className="field">Tom na igreja<select value={draft.churchKey} onChange={e => change('churchKey', e.target.value)}>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
      </div>
      <section className="songs-cifra-primary" aria-label="Importar cifra do Cifra Club">
        <div className="songs-cifra-primary-heading"><div><span>FONTE PRINCIPAL</span><h3><Music2 size={18} />Cifra Club</h3></div><a className="button button-secondary" href={cifraClubSearchUrl(draft.title, draft.artist)} target="_blank" rel="noopener noreferrer">Consultar no Cifra Club<ExternalLink size={13} /></a></div>
        <p className="songs-cifra-instructions">Consulte a música pelo título e artista, copie a letra e cifra e cole abaixo. Confira a versão e o tom antes de importar.</p>
        <label className="field">Link da cifra no Cifra Club <span className="songs-optional">opcional</span><input type="url" value={cifraClubUrl} onChange={e => { setCifraClubUrl(e.target.value); setCifraError(null); }} placeholder="https://www.cifraclub.com.br/artista/musica/" /><span className="songs-field-hint">Guarde o endereço da versão que você escolheu.{isSafeCifraClubUrl(cifraClubUrl.trim()) && <a className="songs-cifraclub-link" href={normalizeCifraClubUrl(cifraClubUrl.trim())!} target="_blank" rel="noopener noreferrer">Abrir cifra cadastrada<ExternalLink size={11} /></a>}</span></label>
        <label className="field">Texto copiado do Cifra Club<textarea className="songs-content-input songs-cifra-paste" rows={5} value={cifraClubText} onChange={e => { setCifraClubText(e.target.value); setCifraImported(false); setCifraError(null); setCifraConfirmReplace(false); }} placeholder={'Tom: C\nC            G\nTua luz nos guia\nAm           F\nSeguimos em paz'} maxLength={100000} /><span className="songs-field-hint">Cole as linhas dos acordes e da letra juntas. O texto colado fica no rascunho até você importar.</span></label>
        {cifraPreview && <div className="songs-cifra-preview"><div><strong>Prévia da cifra</strong><span>{cifraPreview.originalKey ? `Tom detectado: ${cifraPreview.originalKey}` : `Tom original atual: ${draft.originalKey} · confira com a fonte`}</span></div><pre tabIndex={0} aria-label="Prévia da cifra colada">{cifraPreview.content}</pre></div>}
        <p className="songs-import-hint">{draft.content.trim() ? 'Ao importar, a letra e cifra atuais serão substituídas. ' : 'A importação preencherá a letra e cifra abaixo. '}{cifraPreview?.originalKey ? `O tom original será ${cifraPreview.originalKey}. ` : ''}O tom na igreja continuará {draft.churchKey}; título, artista e demais campos serão preservados.</p>
        <FormError error={cifraError} />
        <button type="button" className="button button-primary" disabled={!cifraClubText.trim() || cifraConfirmReplace} onClick={() => draft.content.trim() ? setCifraConfirmReplace(true) : importCifraClubText()}><Download size={15} />Importar texto do Cifra Club</button>
        {cifraConfirmReplace && <div className="songs-cifra-replace" role="group" aria-label="Confirmar substituição da letra e cifra"><p>A letra e cifra atuais serão substituídas pelo texto colado. Os outros campos serão preservados.</p><div><button type="button" className="button button-primary" onClick={importCifraClubText}>Substituir letra e cifra</button><button type="button" className="button button-secondary" onClick={() => setCifraConfirmReplace(false)}>Manter conteúdo atual</button></div></div>}
        {cifraImported && <p className="songs-source-success" role="status"><Check size={15} />Cifra importada no rascunho. Confira os campos e salve a música.</p>}
      </section>
      <section className="songs-source-search" aria-label="Busca online de letra e cifra">
        <button type="button" className="songs-source-heading" aria-expanded={sourceOpen} onClick={() => setSourceOpen(value => !value)}><span><Search size={17} /><strong>Buscar letra e cifra</strong></span><span>{sourceOpen ? 'Fechar busca' : 'Outras fontes'}<Plus size={14} className={sourceOpen ? 'songs-source-expanded' : ''} /></span></button>
        {sourceOpen && <div className="songs-source-body"><p>Preencha o título e, se souber, o artista acima. Escolha uma fonte e confira a prévia antes de importar.</p>
          <div className="songs-source-controls"><div className="song-content-tabs" role="group" aria-label="Fonte da busca"><button type="button" className={sourceKind === 'chords' ? 'active' : ''} aria-pressed={sourceKind === 'chords'} onClick={() => switchSource('chords')}>Letra e cifra</button><button type="button" className={sourceKind === 'lyrics' ? 'active' : ''} aria-pressed={sourceKind === 'lyrics'} onClick={() => switchSource('lyrics')}>Somente letra</button></div><button type="button" className="button button-secondary" disabled={searching || Boolean(previewing)} onClick={searchOnline}>{searching ? <LoaderCircle className="songs-spinner" size={15} /> : <Search size={15} />}{searching ? 'Buscando…' : 'Buscar na fonte'}</button></div>
          <p className="songs-source-credit">{sourceKind === 'chords' ? <><a href="https://www.worshiptogether.com/pt/cancoes/" target="_blank" rel="noopener noreferrer">Worship Together<ExternalLink size={11} /></a> · catálogo de cifras públicas em português; a cobertura depende da fonte.</> : <><a href="https://lrclib.net/" target="_blank" rel="noopener noreferrer">LRCLIB<ExternalLink size={11} /></a> · letras da comunidade; confira a versão. Esta fonte não fornece acordes.</>}</p>
          <FormError error={sourceError} />
          {searched && !sourceResults.length && <p className="songs-source-empty" role="status">Nenhum resultado nesta fonte. Tente parte do título, remova o artista ou escolha a outra fonte.</p>}
          {sourceResults.length > 0 && <ul className="songs-source-results">{sourceResults.map(result => <li key={result.id}><div><strong>{result.title}</strong><span>{result.artist || 'Confira o artista na prévia'}{result.album && ` · ${result.album}`}</span></div><button type="button" className="button button-ghost" disabled={Boolean(previewing)} aria-label={`Ver prévia de ${result.title}`} onClick={() => openPreview(result)}>{previewing === result.id ? 'Abrindo…' : 'Ver prévia'}<ArrowUpRight size={14} /></button></li>)}</ul>}
          {preview && <div className="songs-source-preview"><div className="songs-preview-heading"><div><h3>{preview.title}</h3><p>{preview.artist || 'Artista não informado pela fonte'} · {preview.kind === 'chords' ? `Tom original: ${preview.originalKey || 'não informado'}` : 'Letra sem acordes'}</p></div><a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">Ver fonte<ExternalLink size={12} /></a></div><pre tabIndex={0} aria-label="Prévia do conteúdo para importar">{preview.content}</pre><label className="songs-source-metadata"><input type="checkbox" checked={useSourceMetadata} onChange={e => setUseSourceMetadata(e.target.checked)} />Atualizar título e artista com os dados da fonte</label><p className="songs-import-hint">{draft.content.trim() ? 'A importação substituirá a letra e cifra do formulário. ' : ''}{preview.kind === 'chords' ? `O tom original será ${sourceKey(preview.originalKey) || preview.originalKey || 'revisado'}. ` : ''}O tom na igreja e os outros campos serão preservados. A fonte será registrada nas observações.</p><button type="button" className="button button-primary" onClick={importPreview}><Download size={15} />{draft.content.trim() ? 'Substituir conteúdo pela prévia' : 'Importar prévia'}</button></div>}
          {imported && <p className="songs-source-success" role="status"><Check size={15} />Conteúdo importado no rascunho. Revise os campos e salve a música.</p>}
        </div>}
      </section>
      <label className="field">Letra e cifra<textarea className="songs-content-input" required rows={9} value={draft.content} onChange={e => change('content', e.target.value)} placeholder={'[C]Tua luz nos [G]guia\n[Am]Seguimos em [F]paz'} /><span className="songs-field-hint">Escreva os acordes entre colchetes, no tom original: [C], [Am7], [G/B]. Os demais trechos ficam como letra.</span></label>
      <label className="field">Vídeo no YouTube <span className="songs-optional">opcional</span><input type="url" value={draft.youtubeUrl} onChange={e => change('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <label className="field">Observações gerais <span className="songs-optional">opcional</span><textarea rows={3} value={draft.notes} onChange={e => change('notes', e.target.value)} placeholder="Introdução, dinâmica, andamento ou outras orientações" /></label>
      <fieldset className="songs-tags-field"><legend>Etiquetas</legend>{data.tags.length ? <div className="chips">{data.tags.map(tag => {
        const selected = draft.tagIds.includes(tag.id);
        return <button key={tag.id} type="button" className={`chip ${selected ? 'active' : ''}`} aria-pressed={selected} onClick={() => setDraft(current => ({ ...current, tagIds: selected ? current.tagIds.filter(id => id !== tag.id) : [...current.tagIds, tag.id] }))}>{selected && <Check size={13} />}<span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</button>;
      })}</div> : <p className="muted">Cadastre etiquetas na seção Etiquetas para organizar as músicas.</p>}</fieldset>
      <FormError error={error} />
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => { discardDraft(); discardCifraClubDraft(); discardCifraTextDraft(); onClose(); }}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || busy}>{saving ? 'Salvando…' : 'Salvar música'}</button></div>
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
