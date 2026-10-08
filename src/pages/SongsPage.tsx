import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Download, ExternalLink, ListFilter, LoaderCircle, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { KEYS, normalizeSearch, stripChords } from '../lib/music';
import { validateSong } from '../lib/validation';
import { cleanChordSheet, normalizeCifraClubUrl, parseCifraClubText } from '../lib/cifraclub';
import { contentInChurchKey, hasWrittenChords, songInChurchKey } from '../lib/song-tones';
import { useDraft } from '../hooks/useDraft';
import { cifraBrowserStatus, readCifraFromBrowser } from '../lib/cifra-browser';
import { cifraClubUrlFromNotes, notesWithCifraClubSource, previewSongSource, searchUnifiedSongSources, sourceKey, type SongSearchResult } from '../lib/song-search';
import type { Song } from '../types';
import './songs.css';

function blankSong(): Song {
  return { id: crypto.randomUUID(), title: '', artist: '', originalKey: 'C', churchKey: 'C', content: '', youtubeUrl: '', notes: '', tagIds: [] };
}

function SourceKeyConfirmation({ value, onChange, reason }: { value: string; onChange: (key: string) => void; reason?: string }) {
  return <div className="songs-cifra-replace">
    <p>{reason || 'A fonte não informou o tom dos acordes escritos. Confirme esse tom uma vez para converter a cifra corretamente.'}</p>
    <label className="field">Tom dos acordes recebidos<select aria-label="Tom dos acordes recebidos" value={value} onChange={event => onChange(event.target.value)}><option value="">Selecione o tom na fonte</option>{KEYS.map(key => <option key={key}>{key}</option>)}</select><span className="songs-field-hint">Confira o tom das posições dos acordes na fonte. O primeiro acorde sozinho não determina o tom.</span></label>
  </div>;
}

export function SongEditor({ song, incomingSource, incomingDraftId, onClose, onSaved }: { song?: Song; incomingSource?: SongSearchResult; incomingDraftId?: string; onClose: () => void; onSaved?: () => void }) {
  const { data, saveSong, busy } = useMinistry();
  const editorKey = song?.id || (incomingSource ? `mobile:${incomingDraftId || incomingSource.id}` : 'new');
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<Song>(`song:${editorKey}`, () => song ? songInChurchKey({ ...song, tagIds: [...song.tagIds] })
    : incomingSource ? { ...blankSong(), title: incomingSource.title, artist: incomingSource.artist,
      originalKey: sourceKey(incomingSource.soundingKey) || sourceKey(incomingSource.originalKey) || 'C',
      churchKey: sourceKey(incomingSource.soundingKey) || sourceKey(incomingSource.originalKey) || 'C' } : blankSong());
  const { draft: pastedSource, setDraft: setPastedSource, discardDraft: discardPastedSource } = useDraft<{ unknown: boolean; reason: string }>(`song-pasted-source:${editorKey}`, { unknown: false, reason: '' });
  const [repairWrittenKey, setRepairWrittenKey] = useState('');
  const [repairApplied, setRepairApplied] = useState(false);
  const [previewWrittenKey, setPreviewWrittenKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(Boolean(incomingSource));
  const [sourceResults, setSourceResults] = useState<SongSearchResult[]>([]);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<SongSearchResult | null>(incomingSource || null);
  const [previewLyricsOnly, setPreviewLyricsOnly] = useState(false);
  const previewText = useMemo(() => {
    const cleaned = cleanChordSheet(preview?.content || '');
    return previewLyricsOnly ? stripChords(cleaned) : cleaned;
  }, [preview?.content, previewLyricsOnly]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [imported, setImported] = useState(false);
  const [useSourceMetadata, setUseSourceMetadata] = useState(Boolean(incomingSource));
  const [sourceConfirmReplace, setSourceConfirmReplace] = useState(false);
  const sourceRequest = useRef<AbortController | null>(null);
  const [browserConnected, setBrowserConnected] = useState(false);
  const [browserOutdated, setBrowserOutdated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void cifraBrowserStatus(controller.signal).then(status => { setBrowserConnected(status === 'connected'); setBrowserOutdated(status === 'outdated'); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => () => sourceRequest.current?.abort(), []);
  // Older tab drafts still use a separate base key. Rebase once, preserving their actual chords.
  useEffect(() => {
    if (draft.originalKey !== draft.churchKey) setDraft(current => songInChurchKey(current));
  }, [draft.originalKey, draft.churchKey, setDraft]);
  const change = (field: keyof Song, value: string) => setDraft(current => field === 'churchKey'
    ? pastedSource.unknown ? { ...current, churchKey: value, originalKey: value } : songInChurchKey(current, value)
    : { ...current, [field]: value });
  const previewNeedsKey = Boolean(preview?.kind === 'chords' && hasWrittenChords(preview.content || '') && !sourceKey(preview.originalKey));
  function prepareContent(current: Song, confirmedKey?: string): Song {
    if (!current.content.trim()) return current;
    const parsed = parseCifraClubText(current.content);
    const rawChords = hasWrittenChords(parsed.content) && !hasWrittenChords(current.content);
    const needsKey = !parsed.originalKey && (pastedSource.unknown || rawChords || Boolean(parsed.keyUnknownReason));
    if (needsKey && !confirmedKey) {
      const reason = parsed.keyUnknownReason || 'Confirme o tom dos acordes colados para ajustá-los ao tom da igreja.';
      setPastedSource({ unknown: true, reason });
      throw new Error(reason);
    }
    return { ...current, content: contentInChurchKey(parsed.content, parsed.originalKey || confirmedKey || current.originalKey, current.churchKey), originalKey: current.churchKey };
  }

  function formatEditedContent(confirmedKey?: string) {
    try {
      const next = prepareContent(draft, confirmedKey);
      if (next.content !== draft.content || next.originalKey !== draft.originalKey) setDraft(next);
      setPastedSource({ unknown: false, reason: '' });
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira a cifra colada.'); }
  }

  async function searchOnline() {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    setSourceOpen(true); setSourceError(null); setPreview(null); setPreviewWrittenKey(''); setSourceResults([]); setSourceWarnings([]); setSearching(true); setPreviewing(null); setSearched(false); setImported(false); setSourceConfirmReplace(false);
    try {
      const response = await searchUnifiedSongSources(draft.title, draft.artist, controller.signal);
      if (controller.signal.aborted) return;
      setSourceResults(response.results); setSourceWarnings(response.warnings); setSearched(true);
    }
    catch (cause) { if (!controller.signal.aborted) setSourceError(cause instanceof Error ? cause.message : 'Não foi possível buscar a música.'); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }

  async function openPreview(result: SongSearchResult) {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    setPreviewing(result.id); setSearching(false); setSourceError(null); setPreview(null); setPreviewWrittenKey(''); setPreviewLyricsOnly(false); setImported(false); setUseSourceMetadata(false); setSourceConfirmReplace(false);
    try {
      const status = result.source === 'Cifra Club' ? await cifraBrowserStatus(controller.signal) : 'missing';
      if (status === 'outdated') { setBrowserOutdated(true); setBrowserConnected(false); throw new Error('Atualize o importador Cifra Club para reconhecer capotraste e o tom dos acordes corretamente. Abra “Atualizar importador” acima.'); }
      const connected = status === 'connected';
      if (connected) setBrowserConnected(true);
      const resultPreview = connected ? await readCifraFromBrowser(result, controller.signal) : await previewSongSource(result, controller.signal);
      if ((resultPreview.content?.length || 0) > 100_000) throw new Error('A letra e cifra desta versão excedem 100.000 caracteres. Escolha outra versão.');
      if (!controller.signal.aborted) setPreview(resultPreview);
    }
    catch (cause) { if (!controller.signal.aborted) setSourceError(cause instanceof Error ? cause.message : 'Não foi possível abrir a prévia.'); }
    finally { if (!controller.signal.aborted) setPreviewing(null); }
  }

  function closeSourceSearch() {
    sourceRequest.current?.abort(); setSourceOpen(false); setSearching(false); setPreviewing(null); setSourceConfirmReplace(false); setSourceResults([]); setPreview(null); setSourceWarnings([]);
  }

  function draftFromPreview(current: Song): Song {
    if (!preview?.content) throw new Error('Escolha uma versão com conteúdo para importar.');
    const key = sourceKey(preview.originalKey) || sourceKey(previewWrittenKey);
    const content = contentInChurchKey(preview.kind === 'lyrics' ? stripChords(preview.content) : preview.content, key || undefined, current.churchKey);
    const attribution = `Fonte ${preview.kind === 'chords' ? 'da letra e cifra' : 'da letra'}: ${preview.source} — ${preview.sourceUrl}`;
    const importedCifraUrl = preview.source === 'Cifra Club' ? normalizeCifraClubUrl(preview.sourceUrl) : null;
    const notes = importedCifraUrl ? notesWithCifraClubSource(current.notes, importedCifraUrl) : current.notes.includes(attribution) ? current.notes : `${current.notes.trim()}${current.notes.trim() ? '\n\n' : ''}${attribution}`;
    return { ...current, content, originalKey: current.churchKey, ...(useSourceMetadata ? { title: preview.title, artist: preview.artist || current.artist } : {}), notes };
  }

  function importPreview() {
    if (!preview?.content) return;
    try { setDraft(current => draftFromPreview(current)); }
    catch (cause) { setSourceError(cause instanceof Error ? cause.message : 'Confira o tom da fonte.'); return; }
    setPastedSource({ unknown: false, reason: '' });
    setPreview(null); setImported(true); setSourceError(null); setSourceConfirmReplace(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let candidate = draft;
    try {
      // Saving an empty form with source metadata selected imports that preview too.
      // A nonempty draft still requires the explicit replace confirmation above.
      if (preview && useSourceMetadata && !candidate.content.trim()) {
        candidate = draftFromPreview(candidate);
        setDraft(candidate); setPastedSource({ unknown: false, reason: '' });
      }
      candidate = prepareContent(candidate);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira o tom da cifra.'); return; }
    const cleaned = { ...candidate, title: candidate.title.trim(), artist: candidate.artist.trim(), youtubeUrl: candidate.youtubeUrl.trim(), notes: notesWithCifraClubSource(candidate.notes, cifraClubUrlFromNotes(candidate.notes)) };
    const invalid = validateSong(cleaned);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setSaving(true);
    try { await saveSong(cleaned); discardDraft(); discardPastedSource(); onSaved?.(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a música. Tente novamente.'); }
    finally { setSaving(false); }
  }

  return <Modal title={song ? 'Editar música' : 'Nova música'} onClose={onClose} wide>
    <form onSubmit={submit} noValidate className="songs-editor">
      <p className="muted songs-editor-intro">Uma boa biblioteca deixa a preparação mais leve. Organize a letra, a cifra e os tons em um só lugar.</p>
      {hasDraft && <p className="songs-draft-note" role="status"><Check size={14} />Rascunho salvo nesta aba. Fechar a janela mantém seus campos.</p>}
      <div className="form-grid">
        <label className="field">Título<input autoFocus required value={draft.title} onChange={e => change('title', e.target.value)} placeholder="Nome da música" maxLength={200} /></label>
        <label className="field">Artista / compositor<input required value={draft.artist} onChange={e => change('artist', e.target.value)} placeholder="Quem compôs ou interpreta" maxLength={200} /></label>
        <label className="field">Tom na igreja<select aria-label="Tom na igreja" value={draft.churchKey} onChange={e => change('churchKey', e.target.value)}>{KEYS.map(key => <option key={key}>{key}</option>)}</select><span className="songs-field-hint">Alterar o tom também transpõe os acordes do rascunho.</span></label>
      </div>
      <section className="songs-source-search" aria-label="Busca online de letra e cifra">
        <div className="songs-unified-search-heading">
          <div><strong>Cifra e letra em uma busca</strong><span>Pesquise pelo título; o artista ajuda a encontrar a versão certa.</span><span>{browserConnected ? 'Importador conectado · cifra automática pelo navegador' : <a href="/conectar-cifra-club" target="_blank" rel="noopener noreferrer">{browserOutdated ? 'Atualizar importador Cifra Club' : 'Conectar importador Cifra Club'}</a>}</span></div>
          <button type="button" className="button button-primary" disabled={searching || Boolean(previewing)} onClick={searchOnline}>{searching ? <LoaderCircle className="songs-spinner" size={15} /> : <Search size={15} />}{searching ? 'Pesquisando…' : 'Pesquisar cifra e letra'}</button>
        </div>
        {sourceOpen && <div className="songs-source-body">
          <div className="songs-source-status"><p>Cifra Club primeiro. O LRCLIB também oferece versões da letra sem acordes. Escolha a música e confira a prévia antes de importar.</p><button type="button" className="button button-ghost" onClick={closeSourceSearch}>Fechar busca<X size={13} /></button></div>
          {sourceWarnings.length > 0 && <div className="songs-source-warnings" role="status">{sourceWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
          <FormError error={sourceError} />
          {previewing && browserConnected && sourceResults.some(result => result.id === previewing && result.source === 'Cifra Club') && <div className="songs-source-empty"><p role="status">Lendo a cifra no seu navegador. A prévia aparecerá aqui; aguarde sem fechar a aba de consulta.</p><button type="button" className="button button-ghost" onClick={() => { sourceRequest.current?.abort(); setPreviewing(null); }}>Cancelar consulta</button></div>}
          {searching && <p className="songs-source-empty" role="status">Procurando versões próximas ao título e ao artista…</p>}
          {searched && !sourceResults.length && <p className="songs-source-empty" role="status">Nenhuma versão encontrada. Tente parte do título ou revise o nome do artista.</p>}
          {sourceResults.length > 0 && <ul className="songs-source-results">{sourceResults.map(result => <li key={`${result.source}:${result.id}`}><div><strong>{result.title}</strong><span>{result.artist || 'Confira o artista na prévia'}{result.album && ` · ${result.album}`}</span><span className={`songs-result-source ${result.source === 'Cifra Club' ? 'songs-result-primary' : ''}`}>{result.source} · {result.kind === 'chords' ? 'Letra e cifra' : 'Letra sem acordes'}</span></div><div className="songs-result-actions"><button type="button" className="button button-ghost" disabled={Boolean(previewing)} aria-label={`Ver prévia de ${result.title}`} onClick={() => openPreview(result)}>{previewing === result.id ? 'Abrindo…' : 'Ver prévia'}<ArrowUpRight size={14} /></button><a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${result.title} na fonte`}>Fonte<ExternalLink size={11} /></a></div></li>)}</ul>}
          {preview && <div className="songs-source-preview">
            <div className="songs-preview-heading"><div><h3>{preview.title}</h3><p>{preview.artist || 'Artista não informado pela fonte'} · {preview.source} · {preview.kind === 'chords' ? `Tom dos acordes na fonte: ${sourceKey(preview.originalKey) || 'a confirmar'}` : 'Letra sem acordes'}</p></div><a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">Ver fonte<ExternalLink size={12} /></a></div>
            {preview.capo !== undefined && <p className="songs-import-hint">Capotraste na fonte: {preview.capo}ª casa{preview.soundingKey ? ` · Tom sonoro: ${preview.soundingKey}` : ''}. Os acordes serão convertidos para teclado, sem capotraste.</p>}
            {previewNeedsKey && <SourceKeyConfirmation value={previewWrittenKey} onChange={setPreviewWrittenKey} reason={preview.keyUnknownReason} />}
            {preview.kind === 'chords' && <label className="songs-source-metadata songs-preview-lyrics"><input type="checkbox" checked={previewLyricsOnly} onChange={e => setPreviewLyricsOnly(e.target.checked)} />Ver somente letra na prévia</label>}
            <pre tabIndex={0} aria-label="Prévia do conteúdo para importar">{previewText.slice(0, 12000)}</pre>
            {previewText.length > 12000 && <p className="songs-import-hint">A prévia exibe o início do texto. A importação inclui o conteúdo completo.</p>}
            <label className="songs-source-metadata"><input type="checkbox" checked={useSourceMetadata} onChange={e => { const checked = e.target.checked; setUseSourceMetadata(checked); if (checked) setDraft(current => ({ ...current, title: preview.title, artist: preview.artist || current.artist })); }} />Atualizar título e artista com os dados da fonte</label>
            {useSourceMetadata && !draft.content.trim() && <p className="songs-import-hint">Você pode importar abaixo ou clicar em Salvar música para preencher e salvar esta versão com título, artista, letra e cifra.</p>}
            <p className="songs-import-hint">{draft.content.trim() ? 'A importação substituirá a letra e cifra do formulário. ' : ''}{preview.kind === 'chords' ? `Os acordes serão ajustados automaticamente para ${draft.churchKey}, o tom da igreja. Tablaturas e diagramas serão removidos. ` : 'Esta versão contém apenas a letra; nenhum acorde será acrescentado. '}A fonte será registrada nas observações.</p>
            <button type="button" className="button button-primary" disabled={sourceConfirmReplace || (previewNeedsKey && !previewWrittenKey)} onClick={() => draft.content.trim() ? setSourceConfirmReplace(true) : importPreview()}><Download size={15} />{preview.kind === 'chords' ? 'Importar cifra e letra' : 'Importar letra sem acordes'}</button>
            {sourceConfirmReplace && <div className="songs-cifra-replace" role="group" aria-label="Confirmar substituição do conteúdo importado"><p>Substituir a letra e cifra atuais pela versão selecionada?{preview.kind === 'lyrics' && ' Esta versão não contém acordes.'}</p><div><button type="button" className="button button-primary" disabled={previewNeedsKey && !previewWrittenKey} onClick={importPreview}>Substituir letra e cifra</button><button type="button" className="button button-secondary" onClick={() => setSourceConfirmReplace(false)}>Manter conteúdo atual</button></div></div>}
          </div>}
          {imported && <p className="songs-source-success" role="status"><Check size={15} />Conteúdo importado no rascunho. A visualização “Letra” oculta os acordes da mesma cifra. Revise os campos e salve a música.</p>}
        </div>}
      </section>
      <label className="field">Letra e cifra<textarea className="songs-content-input" required rows={9} maxLength={100000} value={draft.content} onChange={e => { change('content', e.target.value); setError(null); if (!e.target.value.trim()) setPastedSource({ unknown: false, reason: '' }); }} onBlur={() => formatEditedContent()} onPaste={event => {
        const text = event.clipboardData.getData('text/plain');
        if (!text.trim()) return;
        try {
          const parsed = parseCifraClubText(text);
          const field = event.currentTarget;
          const partial = Boolean(draft.content.slice(0, field.selectionStart).trim() || draft.content.slice(field.selectionEnd).trim());
          if (parsed.originalKey) {
            if (partial && pastedSource.unknown) { event.preventDefault(); setError('Confirme primeiro o tom da cifra atual ou selecione todo o campo antes de colar outra cifra.'); return; }
            event.preventDefault();
            const converted = contentInChurchKey(parsed.content, parsed.originalKey, draft.churchKey);
            change('content', draft.content.slice(0, field.selectionStart) + converted + draft.content.slice(field.selectionEnd));
            setPastedSource({ unknown: false, reason: '' }); setError(null);
          } else if (hasWrittenChords(parsed.content) || parsed.keyUnknownReason) {
            if (partial) {
              event.preventDefault();
              setError('Para colar um trecho de cifra, inclua o cabeçalho “Tom: G”, por exemplo. Sem o tom, selecione todo o campo antes de colar e confirme o tom dos acordes.');
              return;
            }
            setPastedSource({ unknown: true, reason: parsed.keyUnknownReason || 'Confirme o tom dos acordes colados para ajustá-los ao tom da igreja.' });
          }
        } catch (cause) { event.preventDefault(); setError(cause instanceof Error ? cause.message : 'Não foi possível colar a cifra.'); }
      }} placeholder={'[C]Tua luz nos [G]guia\n[Am]Seguimos em [F]paz'} /><span className="songs-field-hint">A busca preenche este campo e você pode editar ou colar uma cifra aqui. Os acordes são ajustados ao tom {draft.churchKey}. Para escrever manualmente, use colchetes: [C], [Am7], [G/B]. A visualização “Letra” oculta os acordes. Até 100.000 caracteres.</span></label>
      {pastedSource.unknown && <SourceKeyConfirmation value="" onChange={key => { if (key) formatEditedContent(key); }} reason={pastedSource.reason} />}
      {song && <details className="songs-manual-import">
        <summary>Corrigir cifra com tom incorreto</summary>
        <p className="songs-import-hint">Se um cadastro antigo informa {draft.churchKey}, mas os acordes estão em outro tom, indique o tom real dos acordes atuais. A correção converterá o texto para {draft.churchKey}. Você também pode importar a cifra novamente.</p>
        <label className="field">Tom dos acordes atuais<select value={repairWrittenKey} onChange={event => { setRepairWrittenKey(event.target.value); setRepairApplied(false); }}><option value="">Selecione o tom real da cifra</option>{KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
        <button type="button" className="button button-secondary" disabled={!repairWrittenKey || repairApplied} onClick={() => { setDraft(current => ({ ...current, content: contentInChurchKey(current.content, repairWrittenKey, current.churchKey), originalKey: current.churchKey })); setRepairApplied(true); }}>Aplicar correção do tom</button>
        {repairApplied && <p role="status" className="songs-source-success">Acordes corrigidos no rascunho. Confira e salve a música.</p>}
      </details>}
      <label className="field">Vídeo no YouTube <span className="songs-optional">opcional</span><input type="url" value={draft.youtubeUrl} onChange={e => change('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <label className="field">Observações gerais <span className="songs-optional">opcional</span><textarea rows={3} value={draft.notes} onChange={e => change('notes', e.target.value)} placeholder="Introdução, dinâmica, andamento ou outras orientações" /></label>
      <fieldset className="songs-tags-field"><legend>Etiquetas</legend>{data.tags.length ? <div className="chips">{data.tags.map(tag => {
        const selected = draft.tagIds.includes(tag.id);
        return <button key={tag.id} type="button" className={`chip ${selected ? 'active' : ''}`} aria-pressed={selected} onClick={() => setDraft(current => ({ ...current, tagIds: selected ? current.tagIds.filter(id => id !== tag.id) : [...current.tagIds, tag.id] }))}>{selected && <Check size={13} />}<span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</button>;
      })}</div> : <p className="muted">Cadastre etiquetas na seção Etiquetas para organizar as músicas.</p>}</fieldset>
      <FormError error={error} />
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => { discardDraft(); discardPastedSource(); onClose(); }}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || busy}>{saving ? 'Salvando…' : 'Salvar música'}</button></div>
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
      <div className="songs-key"><span className="songs-key-badge">{song.churchKey}</span></div>
      <div className="songs-row-tags">{data.tags.filter(tag => song.tagIds.includes(tag.id)).map(tag => <span key={tag.id} className="songs-tag"><span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</span>)}{!song.tagIds.length && <span className="muted songs-no-tags">Sem etiquetas</span>}</div>
      <div className="songs-row-actions">{canEditLibrary && <><button className="icon-button" aria-label={`Editar ${song.title}`} title="Editar música" onClick={() => setEditor(song)}><Pencil size={16} /></button><button className="icon-button songs-delete" aria-label={`Excluir ${song.title}`} title="Excluir música" onClick={() => { setDeleting(song); setDeleteError(null); }}><Trash2 size={16} /></button></>}<Link className="icon-button songs-open" to={`/musicas/${song.id}`} aria-label={`Abrir ${song.title}`}><ArrowUpRight size={19} /></Link></div>
    </article>)}</div> : <div className="card"><EmptyState title={filtered ? 'Nenhuma música com esses filtros' : 'A biblioteca começa com uma canção'} description={filtered ? 'Tente outro título, tom ou combinação de etiquetas.' : 'Adicione as músicas que fazem parte da caminhada do ministério.'} action={filtered ? <button className="button button-secondary" onClick={reset}>Limpar filtros</button> : canEditLibrary ? <button className="button button-primary" onClick={() => setEditor('new')}><Plus size={16} />Adicionar música</button> : undefined} /></div>}
    <p className="songs-footer-note"><Music2 size={14} />Os ajustes de tom na visualização preservam a música original.</p>
    {editor && <SongEditor song={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {deleting && <Modal title="Excluir música" onClose={() => setDeleting(null)}><p>Excluir <strong>{deleting.title}</strong> da biblioteca?</p>{usedBy > 0 ? <p className="songs-delete-warning">Esta música aparece em {usedBy} {usedBy === 1 ? 'culto' : 'cultos'}. Remova-a dos repertórios antes de excluir.</p> : <p className="muted">Esta ação remove a letra, a cifra e as observações cadastradas.</p>}<FormError error={deleteError} /><div className="form-actions"><button className="button button-secondary" onClick={() => setDeleting(null)}>Cancelar</button><button className="button songs-danger-button" disabled={usedBy > 0 || removing || busy} onClick={removeSong}>{removing ? 'Excluindo…' : 'Excluir música'}</button></div></Modal>}
  </>;
}
