import { useState } from 'react';
import { KEYS } from '../../lib/music';

/** For older songs whose chords were saved in a key other than the one recorded. */
export default function KeyRepair({ churchKey, onApply }: { churchKey: string; onApply: (writtenKey: string) => void }) {
  const [writtenKey, setWrittenKey] = useState('');
  const [applied, setApplied] = useState(false);
  return (
    <details className="songs-manual-import">
      <summary>Corrigir cifra com tom incorreto</summary>
      <p className="songs-import-hint">
        Se um cadastro antigo informa {churchKey}, mas os acordes estão em outro tom, indique o tom real dos acordes atuais. A correção
        converterá o texto para {churchKey}. Você também pode importar a cifra novamente.
      </p>
      <label className="field">
        Tom dos acordes atuais
        <select
          value={writtenKey}
          onChange={event => {
            setWrittenKey(event.target.value);
            setApplied(false);
          }}
        >
          <option value="">Selecione o tom real da cifra</option>
          {KEYS.map(key => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={!writtenKey || applied}
        onClick={() => {
          onApply(writtenKey);
          setApplied(true);
        }}
      >
        Aplicar correção do tom
      </button>
      {applied && (
        <p role="status" className="songs-source-success">
          Acordes corrigidos no rascunho. Confira e salve a música.
        </p>
      )}
    </details>
  );
}
