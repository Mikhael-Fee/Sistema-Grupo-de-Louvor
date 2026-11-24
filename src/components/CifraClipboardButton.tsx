import { useId, useState } from 'react';
import { ClipboardPaste, LoaderCircle } from 'lucide-react';
import { FormError } from './ui';
import type { SongSearchResult } from '../lib/song-search';

/** Reads only when the user taps; the copied text becomes a preview and is never saved automatically. */
export default function CifraClipboardButton({ onRead, disabled = false }: { onRead: (source: SongSearchResult) => void; disabled?: boolean }) {
  const hintId = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste() {
    setError(null);
    if (!navigator.clipboard?.readText) {
      setError('Este navegador não permite ler o texto copiado por aqui. Toque e segure no campo Letra e cifra e escolha Colar.');
      return;
    }
    setReading(true);
    try {
      const text = await navigator.clipboard.readText();
      const { songFromCopiedText } = await import('../lib/cifra-copied');
      onRead(songFromCopiedText(text));
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'O navegador não liberou o texto copiado. Permita colar ou toque e segure no campo Letra e cifra e escolha Colar.'
        : cause instanceof Error ? cause.message : 'Não foi possível ler o texto copiado.');
    } finally { setReading(false); }
  }

  return <section className="cifra-pdf-picker" aria-label="Importar cifra copiada" aria-busy={reading}>
    <div className="cifra-pdf-picker-actions">
      <button type="button" className="button button-secondary" disabled={disabled || reading} aria-describedby={hintId} onClick={() => void paste()}>{reading ? <LoaderCircle size={17} className="spin" /> : <ClipboardPaste size={17} />}Colar cifra copiada</button>
    </div>
    <p id={hintId} className="cifra-pdf-picker-hint">No celular, abra a música no Cifra Club, toque e segure no texto, escolha <strong>Selecionar tudo</strong> e <strong>Copiar</strong>. Volte aqui e toque no botão: menus e comentários são descartados. Confira a prévia e o tom antes de importar.</p>
    <FormError error={error} />
  </section>;
}
