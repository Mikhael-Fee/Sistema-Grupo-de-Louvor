import { useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Save } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { FormError, PageHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import PhotoPicker, { type PhotoChange } from '../components/PhotoPicker';
import { getProfilePhoto } from '../lib/avatars';
import { ROLE_LABELS } from '../types';

export default function ProfilePage() {
  const { data, profile, mode, busy, updateProfilePhoto } = useMinistry();
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  if (mode === 'public' || !profile?.approved) return <Navigate to="/" replace />;
  const photoUrl = getProfilePhoto(profile, data);
  const person = data.people.find(candidate => candidate.id === profile.personId);
  const disabled = saving || busy || processing;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photo === undefined || disabled || lock.current) return;
    lock.current = true; setSaving(true); setError(null); setSaved(false);
    try { await updateProfilePhoto(photo); setPhoto(undefined); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a foto. Tente novamente.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <>
    <PageHeader eyebrow="Sua identificação" title="Meu perfil" description="Escolha a foto que identifica você no Candeia." />
    <section className="card profile-page-card">
      <div className="profile-page-identity"><ProfileAvatar name={profile.name} photoUrl={photoUrl} size={64} /><div><h2>{profile.name}</h2><p>{ROLE_LABELS[profile.role]}</p></div></div>
      <form onSubmit={event => void submit(event)}>
        <h3>Foto de perfil</h3>
        <PhotoPicker name={profile.name} currentPhotoUrl={photoUrl} fallbackPhotoUrl={person?.photoUrl} hasOwnPhoto={Boolean(profile.photoUrl)} value={photo} disabled={saving || busy} onBusyChange={setProcessing} onChange={value => { setPhoto(value); setError(null); setSaved(false); }} />
        <p className="profile-page-note">Ao vincular sua conta a uma pessoa da equipe, sua foto também aparece nas escalas quando essa pessoa não tem uma foto própria. Se você remover a foto da conta, seu perfil passa a usar a foto da pessoa vinculada, quando houver.</p>
        <FormError error={error} />
        <div className="form-actions"><button className="button button-primary" disabled={disabled || photo === undefined}><Save size={16} />{saving ? 'Salvando foto…' : 'Salvar foto'}</button></div>
        {saved && <p className="profile-page-success" role="status"><Check size={16} />Foto atualizada.</p>}
      </form>
    </section>
  </>;
}
