import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Camera, LoaderCircle, Undo2, X } from 'lucide-react';
import { PHOTO_INPUT_ACCEPT, preprocessProfilePhoto } from '../lib/profile-photo';
import ProfileAvatar from './ProfileAvatar';
import './avatar.css';

export type PhotoChange = Blob | null | undefined;

export default function PhotoPicker({ name, currentPhotoUrl, value, onChange, onBusyChange, disabled = false }: {
  name: string; currentPhotoUrl?: string; value: PhotoChange; onChange: (value: PhotoChange) => void;
  onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const [preview, setPreview] = useState<string | undefined>();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current++; };
  }, []);
  useEffect(() => {
    if (!(value instanceof Blob)) { setPreview(undefined); return; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || processing) return;
    const current = ++request.current;
    setProcessing(true); setError(null); onBusyChange?.(true);
    try {
      const photo = await preprocessProfilePhoto(file);
      if (mounted.current && current === request.current) onChange(photo);
    } catch (cause) {
      if (mounted.current && current === request.current) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta foto. Escolha outra imagem.');
    } finally {
      if (mounted.current && current === request.current) { setProcessing(false); onBusyChange?.(false); }
    }
  }

  const effectivePhoto = value === null ? undefined : value instanceof Blob ? preview : currentPhotoUrl;
  const blocked = disabled || processing;
  return <div className="photo-picker" aria-busy={processing || undefined}>
    <div className="photo-picker-row">
      <ProfileAvatar name={name} photoUrl={effectivePhoto} size={80} />
      <div className="photo-picker-copy"><strong>Foto</strong><p id={hintId}>Escolha uma foto JPG, PNG ou WebP, até 10 MB. O enquadramento fica centralizado.</p>
        <div className="photo-picker-actions">
          <input ref={input} className="photo-picker-input" type="file" accept={PHOTO_INPUT_ACCEPT} aria-label="Escolher foto" aria-describedby={hintId} tabIndex={-1} disabled={blocked} onChange={event => void choose(event)} />
          <button type="button" className="button button-secondary" disabled={blocked} onClick={() => input.current?.click()}>{processing ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}{processing ? 'Preparando foto…' : effectivePhoto ? 'Trocar foto' : 'Escolher foto'}</button>
          {(value instanceof Blob || currentPhotoUrl && value !== null) && <button type="button" className="button button-secondary" disabled={blocked} onClick={() => { setError(null); onChange(null); }}><X size={15} />Remover foto</button>}
          {value !== undefined && <button type="button" className="photo-picker-undo" disabled={blocked} onClick={() => { setError(null); onChange(undefined); }}><Undo2 size={14} />Desfazer alteração</button>}
        </div>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {value !== undefined && !processing && <p className="photo-picker-status" role="status">{value === null ? 'A foto será removida ao salvar.' : 'Foto pronta. Salve para confirmar a alteração.'}</p>}
  </div>;
}
