import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Music2, Settings, UserRound } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { getProfilePhoto } from '../lib/avatars';
import { ROLE_LABELS } from '../types';
import UnavailabilityCard from '../components/UnavailabilityCard';
import NotificationsCard from '../components/NotificationsCard';
import ThemeCard from '../components/ThemeCard';
import {
  AboutMeForm,
  HeroPhotoButton,
  HistoryCard,
  type PhotoNotice,
  ProfileHero,
  RehearsalCard,
  SongKeysCard,
  UpcomingServicesCard,
} from '../components/MemberProfile';
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
  const { data, profile, mode, profilesEnabled } = useMinistry();
  const [photoNotice, setPhotoNotice] = useState<PhotoNotice | null>(null);
  useEffect(() => {
    if (photoNotice?.kind !== 'ok') return;
    const timer = window.setTimeout(() => setPhotoNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [photoNotice]);
  if (mode === 'public' || !profile?.approved) return <Navigate to="/" replace />;
  const today = ministryToday();
  const photoUrl = getProfilePhoto(profile, data);
  const person = data.people.find(candidate => candidate.id === profile.personId);
  const stats = person ? personStats(data, person.id, today) : undefined;
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
        photoAction={
          <HeroPhotoButton hasOwnPhoto={Boolean(profile.photoUrl)} hasTeamPhoto={Boolean(person?.photoUrl)} onNotice={setPhotoNotice} />
        }
        notice={photoNotice}
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
            {!person ? (
              unlinked
            ) : profilesEnabled ? (
              <AboutMeForm key={`${person.id}:${person.name}`} person={person} />
            ) : (
              <section className="card member-card">
                <p className="muted member-unlinked">Seus dados aparecem aqui assim que o banco do app for atualizado.</p>
              </section>
            )}
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
