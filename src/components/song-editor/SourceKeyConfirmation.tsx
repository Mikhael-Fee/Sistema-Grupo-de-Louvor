import { KEYS } from '../../lib/music';

/** Asks which key the received chords are written in, so they can be moved to the church key. */
export default function SourceKeyConfirmation({
  value,
  onChange,
  reason,
  detected,
}: {
  value: string;
  onChange: (key: string) => void;
  reason?: string;
  detected?: string;
}) {
  if (detected)
    return (
      <label className="field songs-source-key">
        Tom dos acordes recebidos
        <select aria-label="Tom dos acordes recebidos" value={value || detected} onChange={event => onChange(event.target.value)}>
          {KEYS.map(key => (
            <option key={key}>{key}</option>
          ))}
        </select>
        <span className="songs-field-hint">
          Detectado: {detected}. Se os acordes da prévia estiverem em outro tom, escolha o tom certo antes de importar. Tons menores usam a
          relativa maior (Gm → Bb).
        </span>
      </label>
    );
  return (
    <div className="songs-cifra-replace">
      <p>{reason || 'A fonte não informou o tom dos acordes escritos. Confirme esse tom uma vez para converter a cifra corretamente.'}</p>
      <label className="field">
        Tom dos acordes recebidos
        <select aria-label="Tom dos acordes recebidos" value={value} onChange={event => onChange(event.target.value)}>
          <option value="">Selecione o tom na fonte</option>
          {KEYS.map(key => (
            <option key={key}>{key}</option>
          ))}
        </select>
        <span className="songs-field-hint">
          Confira o tom das posições dos acordes na fonte. O primeiro acorde sozinho não determina o tom. Tons menores usam a relativa maior
          (Gm → Bb).
        </span>
      </label>
    </div>
  );
}
