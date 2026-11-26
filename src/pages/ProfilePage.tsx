import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Camera, Check, LayoutGrid, Music2, Save, Settings, UserRound } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { FormError } from '../components/ui';
import PhotoPicker, { type PhotoChange } from '../components/PhotoPicker';
import { getProfilePhoto } from '../lib/avatars';
import { ROLE_LABELS } from '../types';
import UnavailabilityCard from '../components/UnavailabilityCard';
import NotificationsCard from '../components/NotificationsCard';
import ThemeCard from '../components/ThemeCard';
import { AboutMeForm, HistoryCard, ProfileHero, RehearsalCard, SongKeysCard, UpcomingServicesCard } from '../components/MemberProfile';
import { personStats } from '../lib/member-profile';
import { ministryToday } from '../lib/service-calendar';
import '../components/member-profile.css';

const TABS = [
  { id: 'geral', label: 'Visão geral', icon: LayoutGrid },
  { id: 'musicas', label: 'Músicas', icon: Music2 },
  { id: 'dados', label: 'Meus dados', icon: UserRound },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function ProfilePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('aba');
  const tab: TabId = TABS.some(item => item.id === requested) ? (requested as TabId) : 'geral';
  const { data, profile, mode, busy, updateProfilePhoto, profilesEnabled } = useMinistry();
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  if (mode === 'public' || !profile?.approved) return <Navigate to="/" replace />;
  const today = ministryToday();
  const photoUrl = getProfilePhoto(profile, data);
  const person = data.people.find(candidate => candidate.id === profile.personId);
  const stats = person ? personStats(data, person.id, today) : undefined;
  const disabled = saving || busy || processing;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photo === undefined || disabled || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfilePhoto(photo);
      setPhoto(undefined);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a foto. Tente novamente.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const photoCard = (
    <section className="card member-card member-photo-card" aria-labelledby="member-photo">
      <h2 id="member-photo">
        <span className="member-card-icon">
          <Camera size={16} />
        </span>
        Foto de perfil
      </h2>
      <form onSubmit={event => void submit(event)}>
        <PhotoPicker
          name={profile.name}
          currentPhotoUrl={photoUrl}
          fallbackPhotoUrl={person?.photoUrl}
          hasOwnPhoto={Boolean(profile.photoUrl)}
          value={photo}
          disabled={saving || busy}
          onBusyChange={setProcessing}
          onChange={value => {
            setPhoto(value);
            setError(null);
            setSaved(false);
          }}
        />
        <p className="member-hint">
          Se a sua conta não tiver foto própria, o app usa a foto que o administrador cadastrou para você na equipe.
        </p>
        <FormError error={error} />
        <div className="form-actions">
          <button className="button button-primary" disabled={disabled || photo === undefined}>
            <Save size={16} />
            {saving ? 'Salvando foto…' : 'Salvar foto'}
          </button>
        </div>
        {saved && (
          <p className="profile-page-success" role="status">
            <Check size={16} />
            Foto atualizada.
          </p>
        )}
      </form>
    </section>
  );
  const unlinked = (
    <section className="card member-card">
      <p className="muted member-unlinked">
        Sua conta ainda não está ligada a uma pessoa da equipe. Peça a um administrador para fazer o vínculo em Administração; depois disso
        aparecem aqui suas escalas, seus tons, seu histórico e seus dados.
      </p>
    </section>
  );
  return (
    <div className="member-profile">
      <h1 className="member-sr-only">Meu perfil</h1>
      <ProfileHero
        person={person}
        photoUrl={photoUrl}
        name={person?.name || profile.name}
        subtitle={ROLE_LABELS[profile.role]}
        stats={stats}
        editPhotoTo="/perfil?aba=dados"
      />
      <div className="member-tabs" role="tablist" aria-label="Seções do perfil">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`member-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="member-tabpanel"
            className={tab === id ? 'member-tab member-tab-active' : 'member-tab'}
            onClick={() => setParams(id === 'geral' ? {} : { aba: id }, { replace: true })}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div className="member-tabpanel" id="member-tabpanel" role="tabpanel" aria-labelledby={`member-tab-${tab}`}>
        {tab === 'geral' &&
          (person ? (
            <div className="member-grid">
              <UpcomingServicesCard personId={person.id} today={today} />
              {stats && <HistoryCard stats={stats} />}
            </div>
          ) : (
            unlinked
          ))}
        {tab === 'musicas' &&
          (person ? (
            <div className="member-grid">
              <RehearsalCard personId={person.id} today={today} />
              {profilesEnabled && <SongKeysCard personId={person.id} />}
            </div>
          ) : (
            unlinked
          ))}
        {tab === 'dados' && (
          <div className="member-grid">
            {person && profilesEnabled ? <AboutMeForm key={`${person.id}:${person.name}`} person={person} /> : !person && unlinked}
            {photoCard}
          </div>
        )}
        {tab === 'ajustes' && (
          <div className="member-grid member-settings">
            <UnavailabilityCard />
            <NotificationsCard />
            <ThemeCard />
          </div>
        )}
      </div>
    </div>
  );
}
