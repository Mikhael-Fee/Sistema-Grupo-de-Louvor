import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { FormError } from './ui';
import type { SongSearchResult } from '../lib/song-search';
import './pdf-import.css';

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export default function CifraPdfPicker({ onRead, disabled = false }: { onRead: (source: SongSearchResult) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const hintId = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setReading(true); setError(null); setDone(false);
    try {
      if (file.size > MAX_PDF_BYTES) throw new Error('O PDF deve ter até 8 MB. Salve somente a cifra e tente novamente.');
      const { readCifraPdf } = await import('../lib/cifra-pdf');
      if (controller.signal.aborted || active.current !== controller) return;
      const source = await readCifraPdf(file, controller.signal);
      if (controller.signal.aborted || active.current !== controller) return;
      onRead(source);
      setDone(true);
    } catch (cause) {
      if (!controller.signal.aborted && active.current === controller) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível ler este PDF. Salve a cifra como PDF com texto selecionável e tente novamente.');
      }
    } finally {
      if (active.current === controller) { active.current = null; setReading(false); }
    }
  }

  function cancel() { active.current?.abort(); active.current = null; setReading(false); }

  return <section className="cifra-pdf-picker" aria-label="Importar cifra de um PDF" aria-busy={reading}>
    <div className="cifra-pdf-picker-actions">
      <button type="button" className="button button-secondary" disabled={disabled} aria-describedby={hintId} onClick={() => input.current?.click()}>{reading ? <LoaderCircle size={17} className="spin" /> : <FileText size={17} />}Escolher PDF da cifra</button>
      {reading && <button type="button" className="button button-ghost" onClick={cancel}>Cancelar leitura</button>}
    </div>
    <input ref={input} className="cifra-pdf-file-input" type="file" accept="application/pdf,.pdf" aria-label="Arquivo PDF da cifra" disabled={disabled} tabIndex={-1} onChange={event => void chooseFile(event)} />
    <p id={hintId} className="cifra-pdf-picker-hint">PDF com texto selecionável, até 8 MB. Fotos e PDFs digitalizados não são aceitos. Confira a fonte e o tom na prévia antes de importar.</p>
    {reading && <p className="cifra-pdf-picker-status" role="status">Lendo PDF…</p>}
    {done && <p className="cifra-pdf-picker-status" role="status">PDF lido. Confira a prévia e o tom antes de importar.</p>}
    <FormError error={error} />
  </section>;
}
