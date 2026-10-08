import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Check, FileText, LoaderCircle } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { KEYS, transposeContent } from '../lib/music';
import { contentInChurchKey, resolveSourceTonality } from '../lib/song-tones';
import { notesWithCifraClubSource, sourceKey, type SongSearchResult } from '../lib/song-search';
import { MAX_BATCH_PDF_BYTES, pdfSongIdentity, validatePdfBatchSelection } from '../lib/cifra-pdf-batch';
import { validateSong } from '../lib/validation';
import type { Song } from '../types';
import { FormError, Modal } from './ui';
import './pdf-batch-import.css';

type EntryStatus = 'queued' | 'reading' | 'ready' | 'failed' | 'saving' | 'saved';
interface PdfEntry {
  id: string; songId: string; filename: string; bytes: number; status: EntryStatus;
  selected: boolean; title: string; artist: string; writtenKey: string; churchKey: string;
  churchKeyChanged: boolean; keyConfirmed: boolean; estimated: boolean; requiresKeyConfirmation: boolean;
  previewOpen?: boolean;
  source?: SongSearchResult; fingerprint?: string; error?: string;
}

function soundingKey(writtenKey: string, capo = 0): string {
  if (!writtenKey) return '';
  // Transpose the root itself, avoiding any dependency on the first chord.
  const position = KEYS.indexOf(writtenKey);
  return position < 0 ? '' : KEYS[(position + capo) % KEYS.length];
}

function entryProblem(entry: PdfEntry): string | null {
  if (!entry.title.trim()) return 'Informe o título da música.';
  if (!entry.artist.trim()) return 'Informe o artista ou compositor.';
  if (!sourceKey(entry.writtenKey)) return 'Escolha o tom dos acordes recebidos.';
  if (!sourceKey(entry.churchKey)) return 'Escolha o tom na igreja.';
  if (entry.requiresKeyConfirmation && !entry.keyConfirmed) return 'Confira e confirme o tom provável antes de salvar.';
  return null;
}

/** A separate library action: it never opens or changes the individual editor. */
export default function CifraPdfBatchDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (savedCount: number) => void }) {
  const { data, saveSong, busy, canEditLibrary } = useMinistry();
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const entriesRef = useRef<PdfEntry[]>([]);
  const songsRef = useRef(data.songs);
  songsRef.current = data.songs;
  const inputRef = useRef<HTMLInputElement>(null);
  const reader = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const saveLock = useRef(false);
  const stopSaving = useRef(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const hintId = useId();
  const validEntries = entries.filter(entry => entry.status === 'ready');
  const selected = validEntries.filter(entry => entry.selected);
  const savedCount = entries.filter(entry => entry.status === 'saved').length;
  const failedCount = entries.filter(entry => entry.status === 'failed').length;
  const completed = entries.filter(entry => !['queued', 'reading'].includes(entry.status)).length;
  const selectedProblem = selected.find(entry => entryProblem(entry));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reader.current?.abort(); stopSaving.current = true; };
  }, []);

  function replaceEntries(next: PdfEntry[]) {
    entriesRef.current = next;
    if (mounted.current) setEntries(next);
  }
  function updateEntry(id: string, patch: Partial<PdfEntry>) {
    replaceEntries(entriesRef.current.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
  }
  function duplicateReason(entry: PdfEntry, collection = entriesRef.current): string | null {
    const identity = pdfSongIdentity(entry.title, entry.artist);
    if (identity && songsRef.current.some(song => song.id !== entry.songId && pdfSongIdentity(song.title, song.artist) === identity)) {
      return 'Título e artista já estão na biblioteca.';
    }
    const other = collection.find(item => item.id !== entry.id && item.status !== 'failed'
      && ((entry.fingerprint && item.fingerprint === entry.fingerprint)
        || (identity && pdfSongIdentity(item.title, item.artist) === identity)));
    return other ? `Também aparece nesta seleção: ${other.filename}.` : null;
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!files.length || reader.current || saveLock.current || !canEditLibrary) return;
    const selectionError = validatePdfBatchSelection(files, entriesRef.current.length, entriesRef.current.reduce((sum, entry) => sum + entry.bytes, 0));
    if (selectionError) { setError(selectionError); return; }
    const additions: PdfEntry[] = files.map(file => ({ id: crypto.randomUUID(), songId: crypto.randomUUID(), filename: file.name, bytes: file.size,
      status: 'queued', selected: false, title: '', artist: '', writtenKey: '', churchKey: '', churchKeyChanged: false, keyConfirmed: false, estimated: false, requiresKeyConfirmation: true }));
    replaceEntries([...entriesRef.current, ...additions]);
    setError(null); setNotice(''); setReading(true);
    const controller = new AbortController();
    reader.current = controller;
    try {
      const { readCifraPdf } = await import('../lib/cifra-pdf');
      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted || !mounted.current) break;
        const file = files[index];
        const entry = additions[index];
        updateEntry(entry.id, { status: 'reading' });
        try {
          if (file.size > MAX_BATCH_PDF_BYTES) throw new Error('Este PDF tem mais de 8 MB. Salve somente a cifra de uma música e tente novamente.');
          const imported = await readCifraPdf(file, controller.signal);
          if (controller.signal.aborted || !mounted.current) break;
          const { source, writtenKey, churchKey, estimated, requiresKeyConfirmation } = resolveSourceTonality(imported);
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.content || ''));
          if (controller.signal.aborted || !mounted.current) break;
          const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          const candidate: PdfEntry = { ...entry, source, title: source.title.slice(0, 200), artist: source.artist.slice(0, 200), writtenKey: writtenKey || '', churchKey: churchKey || '', estimated, requiresKeyConfirmation,
            keyConfirmed: !requiresKeyConfirmation && Boolean(writtenKey), fingerprint, status: 'ready', selected: true };
          if (duplicateReason(candidate)) candidate.selected = false;
          updateEntry(entry.id, candidate);
        } catch (cause) {
          if (controller.signal.aborted || !mounted.current) break;
          updateEntry(entry.id, { status: 'failed', error: cause instanceof Error ? cause.message : 'Não foi possível ler este PDF.' });
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a leitura dos PDFs.');
    } finally {
      if (reader.current === controller) reader.current = null;
      if (mounted.current) {
        replaceEntries(entriesRef.current.map(entry => additions.some(item => item.id === entry.id) && ['queued', 'reading'].includes(entry.status)
          ? { ...entry, status: 'failed', error: controller.signal.aborted ? 'Leitura cancelada. Selecione este PDF novamente para tentar.' : 'Este PDF não foi lido. Selecione-o novamente para tentar.' } : entry));
        setReading(false);
        setNotice(controller.signal.aborted ? 'Leitura cancelada. Os PDFs já lidos continuam disponíveis para revisão.' : 'Leitura concluída. Confira as músicas selecionadas antes de salvar.');
      }
    }
  }

  function changeMetadata(entry: PdfEntry, field: 'title' | 'artist', value: string) {
    const next = { ...entry, [field]: value, error: undefined };
    if (duplicateReason(next)) next.selected = false;
    updateEntry(entry.id, next);
  }

  function changeWrittenKey(entry: PdfEntry, value: string) {
    updateEntry(entry.id, { writtenKey: value, keyConfirmed: Boolean(value), error: undefined,
      ...(!entry.churchKeyChanged ? { churchKey: value } : {}) });
  }

  async function saveSelected() {
    if (saveLock.current || reader.current || busy || !canEditLibrary) return;
    const pending = entriesRef.current.filter(entry => entry.status === 'ready' && entry.selected);
    if (!pending.length) { setError('Selecione pelo menos uma música para salvar.'); return; }
    const invalid = pending.find(entry => entryProblem(entry));
    if (invalid) { setError(`${invalid.filename}: ${entryProblem(invalid)}`); return; }
    saveLock.current = true; stopSaving.current = false;
    setSaving(true); setError(null); setNotice('');
    let successes = 0;
    let failures = 0;
    try {
      for (const entry of pending) {
        if (!mounted.current || stopSaving.current) break;
        updateEntry(entry.id, { status: 'saving', error: undefined });
        try {
          const source = entry.source!;
          const notes = source.source === 'Cifra Club' && source.sourceUrl
            ? notesWithCifraClubSource('', source.sourceUrl) : 'Fonte da letra e cifra: Arquivo PDF';
          const song: Song = { id: entry.songId, title: entry.title.trim(), artist: entry.artist.trim(), originalKey: entry.churchKey, churchKey: entry.churchKey,
            content: contentInChurchKey(source.content || '', entry.writtenKey, entry.churchKey), youtubeUrl: '', notes, tagIds: [] };
          const problem = validateSong(song);
          if (problem) throw new Error(problem);
          await saveSong(song);
          successes++;
          if (mounted.current) updateEntry(entry.id, { status: 'saved', selected: false });
        } catch (cause) {
          failures++;
          // Keep the same generated songId. A retry safely upserts that ID if
          // the write committed before a connection or refresh failure.
          if (mounted.current) updateEntry(entry.id, { status: 'ready', error: cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.' });
        }
      }
    } finally {
      saveLock.current = false;
      if (mounted.current) {
        setSaving(false);
        setNotice(`${successes} música${successes === 1 ? '' : 's'} salva${successes === 1 ? '' : 's'} nesta tentativa.${failures ? ` ${failures} falha${failures === 1 ? '' : 's'}; as demais foram preservadas. Tente salvar novamente as que faltam.` : ''}${stopSaving.current ? ' O restante continua disponível para salvar.' : ''}`);
        if (successes) onSaved?.(successes);
      }
    }
  }

  function close() {
    if (saveLock.current) { setError('Aguarde a música atual terminar. Para parar o restante, use “Interromper salvamento”.'); return; }
    reader.current?.abort();
    onClose();
  }

  return <Modal title="Importar vários PDFs" onClose={close} wide>
    <section className="cifra-pdf-batch" aria-label="Importação de várias músicas por PDF" aria-busy={reading || saving}>
      <p className="cifra-pdf-batch-intro">Selecione os PDFs de uma vez, confira cada música e salve as escolhidas. Cada arquivo deve conter uma única cifra. Essa importação é separada do cadastro individual.</p>
      <div className="cifra-pdf-batch-actions">
        <button type="button" className="button button-secondary" disabled={reading || saving || busy || !canEditLibrary || entries.length >= 20} aria-describedby={hintId} onClick={() => inputRef.current?.click()}><FileText size={17} />{entries.length ? 'Adicionar PDFs' : 'Escolher PDFs'}</button>
        {reading && <button type="button" className="button button-ghost" onClick={() => reader.current?.abort()}>Cancelar leitura</button>}
        {saving && <button type="button" className="button button-ghost" onClick={() => { stopSaving.current = true; setNotice('O salvamento será interrompido quando a música atual terminar.'); }}>Interromper salvamento</button>}
      </div>
      <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="cifra-pdf-batch-input" aria-label="Arquivos PDF das cifras" disabled={reading || saving || !canEditLibrary} tabIndex={-1} onChange={event => void chooseFiles(event)} />
      <p id={hintId} className="cifra-pdf-batch-hint">Até 20 PDFs, com 8 MB por arquivo e 80 MB no total. Use PDFs com texto selecionável; fotos e digitalizações não são aceitas. A leitura acontece no seu aparelho, um arquivo por vez.</p>
      <FormError error={error} />
      {reading && <p className="cifra-pdf-batch-status" role="status"><LoaderCircle size={16} className="spin" />Lendo PDFs: {completed} de {entries.length} concluídos.</p>}
      {saving && <p className="cifra-pdf-batch-status" role="status"><LoaderCircle size={16} className="spin" />Salvando músicas, uma por vez…</p>}
      {notice && <p className="cifra-pdf-batch-status" role="status">{notice}</p>}
      {entries.length > 0 && <>
        <div className="cifra-pdf-batch-summary"><p>{selected.length} selecionada{selected.length === 1 ? '' : 's'} · {savedCount} salva{savedCount === 1 ? '' : 's'}{failedCount > 0 && ` · ${failedCount} PDF${failedCount === 1 ? '' : 's'} não lido${failedCount === 1 ? '' : 's'}`}</p><div>
          <button type="button" className="button button-ghost" disabled={reading || saving} onClick={() => replaceEntries(entriesRef.current.map(entry => entry.status === 'ready' ? { ...entry, selected: !duplicateReason(entry) } : entry))}>Selecionar disponíveis</button>
          <button type="button" className="button button-ghost" disabled={reading || saving} onClick={() => replaceEntries(entriesRef.current.map(entry => ({ ...entry, selected: false })))}>Desmarcar todas</button>
        </div></div>
        <ol className="cifra-pdf-batch-list">{entries.map(entry => {
          const locked = reading || saving || entry.status === 'saved';
          const duplicate = duplicateReason(entry);
          const keyEstimate = entry.source?.keyEstimate;
          return <li key={entry.id} className={`cifra-pdf-batch-entry cifra-pdf-batch-entry-${entry.status}`}>
            <div className="cifra-pdf-batch-entry-heading">
              {['ready', 'saving', 'saved'].includes(entry.status) ? <label className="cifra-pdf-batch-selection"><input type="checkbox" checked={entry.selected} disabled={locked} aria-label={`Selecionar ${entry.filename}`} onChange={event => updateEntry(entry.id, { selected: event.target.checked })} /><strong>{entry.filename}</strong></label> : <strong>{entry.filename}</strong>}
              {entry.status === 'saved' && <span className="cifra-pdf-batch-saved"><Check size={15} />Salva</span>}
              {entry.status === 'reading' && <span className="cifra-pdf-batch-status"><LoaderCircle size={15} className="spin" />Lendo…</span>}
              {entry.status === 'queued' && <span className="muted">Aguardando leitura</span>}
              {!reading && !saving && ['ready', 'failed'].includes(entry.status) && <button type="button" className="button button-ghost" aria-label={`Retirar ${entry.filename} da seleção`} onClick={() => replaceEntries(entriesRef.current.filter(item => item.id !== entry.id))}>Retirar PDF</button>}
            </div>
            {entry.source && <>
              {duplicate && entry.status !== 'saved' && <p className="cifra-pdf-batch-duplicate">{duplicate} Se selecionar, será criada uma nova cópia; a música existente será preservada.</p>}
              <div className="form-grid">
                <label className="field">Título<input aria-label={`Título de ${entry.filename}`} value={entry.title} disabled={locked} maxLength={200} onChange={event => changeMetadata(entry, 'title', event.target.value)} /></label>
                <label className="field">Artista / compositor<input aria-label={`Artista de ${entry.filename}`} value={entry.artist} disabled={locked} maxLength={200} onChange={event => changeMetadata(entry, 'artist', event.target.value)} /></label>
                <label className="field">Tom dos acordes recebidos<select aria-label={`Tom recebido de ${entry.filename}`} value={entry.writtenKey} disabled={locked} onChange={event => changeWrittenKey(entry, event.target.value)}><option value="">Escolha o tom</option>{KEYS.map(key => <option key={key}>{key}</option>)}</select><small>{entry.estimated ? 'Tom provável, calculado pelos acordes.' : entry.source.originalKey ? 'Tom informado no PDF.' : 'O PDF não informou o tom. Confira a cifra.'}</small></label>
                <label className="field">Tom na igreja<select aria-label={`Tom na igreja de ${entry.filename}`} value={entry.churchKey} disabled={locked} onChange={event => updateEntry(entry.id, { churchKey: event.target.value, churchKeyChanged: true, error: undefined })}><option value="">Escolha o tom</option>{KEYS.map(key => <option key={key}>{key}</option>)}</select><small>Começa no tom recebido. Alterar transpõe a cifra ao salvar.</small></label>
              </div>
              {entry.source.capo !== undefined && <p className="cifra-pdf-batch-hint">Capotraste na fonte: {entry.source.capo}ª casa · Tom sonoro na fonte: {soundingKey(entry.writtenKey, entry.source.capo) || 'a confirmar'}. O tom inicial na igreja usa os acordes escritos, retirando o efeito do capotraste.</p>}
              {entry.estimated && <div className="cifra-pdf-batch-key-estimate"><p>Tom provável: {keyEstimate?.key}{keyEstimate?.mode === 'minor' ? ' menor' : ' maior'}{keyEstimate?.borrowedChords?.length ? `. Possíveis empréstimos: ${keyEstimate.borrowedChords.join(', ')}.` : '.'} Confira antes de salvar.</p>{entry.requiresKeyConfirmation && <label><input type="checkbox" aria-label={`Confirmar tom provável de ${entry.filename}`} checked={entry.keyConfirmed} disabled={locked} onChange={event => updateEntry(entry.id, { keyConfirmed: event.target.checked, error: undefined })} />Confirmo o tom dos acordes recebidos</label>}</div>}
              <details className="cifra-pdf-batch-preview" open={Boolean(entry.previewOpen)} onToggle={event => { const open = event.currentTarget.open; if (open !== Boolean(entry.previewOpen)) updateEntry(entry.id, { previewOpen: open }); }}><summary>Conferir cifra de {entry.title || entry.filename}</summary>{entry.previewOpen && <><pre tabIndex={0}>{entry.writtenKey && entry.churchKey ? transposeContent(entry.source.content || '', entry.writtenKey, entry.churchKey).slice(0, 12000) : (entry.source.content || '').slice(0, 12000)}</pre>{(entry.source.content?.length || 0) > 12000 && <p className="cifra-pdf-batch-hint">A prévia exibe o início. A música salva inclui a cifra completa.</p>}</>}</details>
            </>}
            <FormError error={entry.error} />
          </li>;
        })}</ol>
        {selectedProblem && !reading && !saving && <p className="cifra-pdf-batch-hint">{selectedProblem.filename}: {entryProblem(selectedProblem)}</p>}
      </>}
      <div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={close}>{savedCount ? 'Concluir' : 'Fechar'}</button><button type="button" className="button button-primary" disabled={!selected.length || Boolean(selectedProblem) || reading || saving || busy || !canEditLibrary} onClick={() => void saveSelected()}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{saving ? 'Salvando…' : `Salvar selecionadas${selected.length ? ` (${selected.length})` : ''}`}</button></div>
    </section>
  </Modal>;
}
