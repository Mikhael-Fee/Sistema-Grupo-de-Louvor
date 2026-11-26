import { Link } from 'react-router-dom';
import { ArrowRight, Cake, CalendarDays, Clock3, Music2, Users, Plus, Check } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { EmptyState, PageHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import { getPersonPhoto } from '../lib/avatars';
import PresenceButtons, { StatusBadge } from '../components/PresenceButtons';
import { upcomingBirthdays } from '../lib/member-profile';
import { unavailableOn } from '../lib/presence';
import type { Person } from '../types';
import '../components/member-profile.css';

function birthdayWhen(person: Person, inDays: number) {
  if (inDays === 0) return 'Hoje! 🎉';
  if (inDays === 1) return 'Amanhã';
  const date = new Date(Date.UTC(2000, person.birthMonth! - 1, person.birthDay!));
  return sentenceCase(date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })) + ` · em ${inDays} dias`;
}

/** Team birthdays in the next seven days. */
function BirthdaysCard({ people, today, myPersonId }: { people: Person[]; today: string; myPersonId?: string }) {
  const birthdays = upcomingBirthdays(people, today, 7);
  if (!birthdays.length) return null;
  return (
    <section className="card member-birthdays" aria-labelledby="birthdays-title">
      <h2 id="birthdays-title" className="member-card-title">
        <Cake size={18} aria-hidden="true" /> Aniversariantes da semana
      </h2>
      <ul>
        {birthdays.map(({ person, inDays }) => (
          <li key={person.id} className={inDays === 0 ? 'member-birthday-today' : undefined}>
            <ProfileAvatar name={person.name} photoUrl={getPersonPhoto(person)} size={36} decorative />
            <span>
              <strong>
                {person.name}
                {person.id === myPersonId && <span className="you-tag">você</span>}
              </strong>
              <small>{birthdayWhen(person, inDays)}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function dateParts(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    day: value.toLocaleDateString('pt-BR', { day: '2-digit' }),
    month: value.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    full: sentenceCase(value.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })),
  };
}
function sentenceCase(text: string) {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}
export default function HomePage() {
  const { data, profile, canPlan, presenceEnabled } = useMinistry();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const upcoming = [...data.services]
    .filter(s => s.date >= today)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const next = upcoming[0];
  const mine = next?.assignments.filter(a => a.personId === profile?.personId) || [];
  const nextDate = next ? dateParts(next.date) : null;
  const myServices = profile?.personId
    ? upcoming
        .map(service => ({ service, assignments: service.assignments.filter(a => a.personId === profile.personId) }))
        .filter(item => item.assignments.length)
        .slice(0, 4)
    : [];
  return (
    <>
      <PageHeader
        title={`Olá, ${profile?.name.split(' ')[0] || 'equipe'} 👋`}
        action={
          canPlan ? (
            <Link className="button button-primary" to="/cultos?novo=1">
              <Plus size={18} />
              Novo culto
            </Link>
          ) : undefined
        }
      />
      <BirthdaysCard people={data.people} today={today} myPersonId={profile?.personId} />
      {next ? (
        <>
          <section className="next-service">
            <div className="next-service-copy">
              <span className="label-pill">
                <span className="status-dot" />
                PRÓXIMO CULTO
              </span>
              <h2>{next.type}</h2>
              <p className="next-date">
                <CalendarDays size={18} />
                {nextDate?.full}
                <span className="next-divider" />
                <Clock3 size={18} />
                {next.time}
              </p>
              {mine.length > 0 ? (
                <p className="your-assignment">
                  <Check size={17} />
                  Você está escalado: <strong>{mine.map(a => a.function).join(', ')}</strong>
                </p>
              ) : null}
              {presenceEnabled && mine.length > 0 && <PresenceButtons assignments={mine} tone="dark" />}
              <Link className="button button-light" to={`/cultos/${next.id}`}>
                Abrir culto
                <ArrowRight size={18} />
              </Link>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-disc">
                <Music2 size={78} strokeWidth={1} />
              </div>
              <span className="hero-note note-one">♪</span>
              <span className="hero-note note-two">♫</span>
              <span className="hero-line line-one" />
              <span className="hero-line line-two" />
              <span className="hero-line line-three" />
            </div>
          </section>
          <div className="dashboard-columns">
            <section className="card dashboard-repertoire">
              <div className="card-heading">
                <div>
                  <h2>Nosso repertório</h2>
                </div>
                <Link to={`/cultos/${next.id}`} className="text-link">
                  Ver culto
                  <ArrowRight size={15} />
                </Link>
              </div>
              {next.repertoire.length ? (
                <ol className="home-song-list">
                  {next.repertoire.map((item, index) => {
                    const song = data.songs.find(s => s.id === item.songId);
                    const note = (item.notes || '')
                      .split(/\r?\n/)
                      .find(line => line.trim())
                      ?.trim();
                    return (
                      <li key={item.id}>
                        <Link to={`/musicas/${item.songId}?service=${next.id}&item=${item.id}`}>
                          <span className="song-number">{String(index + 1).padStart(2, '0')}</span>
                          <span className="song-list-copy">
                            <strong>{song?.title || 'Música indisponível'}</strong>
                            <span>{song?.artist}</span>
                            {note && (
                              <span className="home-song-note" title={note}>
                                Obs.: {note}
                              </span>
                            )}
                          </span>
                          <span className="key-badge">{item.key}</span>
                          <ArrowRight size={16} className="muted" />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState title="Repertório ainda não definido" />
              )}
            </section>
            <section className="card dashboard-team">
              <div className="card-heading">
                <div>
                  <h2>Equipe escalada</h2>
                </div>
                <span className="count-badge">{next.assignments.length}</span>
              </div>
              <div className="home-team-list">
                {next.assignments.map(a => {
                  const person = data.people.find(p => p.id === a.personId);
                  return (
                    <div key={a.id} className="home-team-person">
                      <ProfileAvatar
                        name={person?.name || 'Pessoa indisponível'}
                        photoUrl={getPersonPhoto(person)}
                        size={41}
                        className={`avatar ${person?.id === profile?.personId ? 'avatar-green' : ''}`}
                        decorative
                      />
                      <div>
                        <strong>
                          {person?.name || 'Pessoa indisponível'}
                          {person?.id === profile?.personId && <span className="you-tag">você</span>}
                        </strong>
                        <span>{a.function}</span>
                      </div>
                    </div>
                  );
                })}
                {!next.assignments.length && <p className="muted">A equipe ainda não foi definida.</p>}
              </div>
              <Link className="team-footer" to={`/cultos/${next.id}`}>
                Ver escala completa
                <ArrowRight size={16} />
              </Link>
            </section>
          </div>
        </>
      ) : (
        <section className="card">
          <EmptyState
            title="Nenhum culto agendado"
            action={
              canPlan && (
                <Link to="/cultos?novo=1" className="button button-primary">
                  Criar culto
                  <Plus size={18} />
                </Link>
              )
            }
          />
        </section>
      )}
      <section className="upcoming-section">
        <div className="section-heading">
          <h2>Próximos encontros</h2>
          <Link className="text-link" to="/cultos">
            Todos os cultos
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="upcoming-grid">
          {upcoming.slice(1, 4).map(service => {
            const d = dateParts(service.date);
            return (
              <Link key={service.id} to={`/cultos/${service.id}`} className="upcoming-card">
                <span className="date-tile">
                  <strong>{d.day}</strong>
                  <span>{d.month}</span>
                </span>
                <div>
                  <h3>{service.type}</h3>
                  <p>
                    <Clock3 size={14} />
                    {service.time}
                    <span>·</span>
                    {service.repertoire.length} músicas
                  </p>
                </div>
                <ArrowRight size={18} />
              </Link>
            );
          })}
          {upcoming.length < 2 && <p className="muted">Os próximos cultos aparecerão aqui.</p>}
        </div>
      </section>
      {profile?.personId ? (
        <section className="upcoming-section my-assignments" aria-labelledby="my-assignments-title">
          <div className="section-heading">
            <h2 id="my-assignments-title">Minhas próximas escalas</h2>
          </div>
          {myServices.length ? (
            <div className="upcoming-grid">
              {myServices.map(({ service, assignments }) => {
                const d = dateParts(service.date);
                return (
                  <Link key={service.id} to={`/cultos/${service.id}`} className="upcoming-card my-assignment-card">
                    <span className="date-tile">
                      <strong>{d.day}</strong>
                      <span>{d.month}</span>
                    </span>
                    <div>
                      <h3>{service.type}</h3>
                      <p>
                        <Clock3 size={14} />
                        {service.time}
                        <span>·</span>
                        {assignments.map(a => a.function).join(', ')}
                      </p>
                      {presenceEnabled && (
                        <StatusBadge
                          assignment={assignments[0]}
                          unavailableNote={unavailableOn(data, assignments[0].personId, service.date)?.note}
                        />
                      )}
                    </div>
                    <ArrowRight size={18} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="muted">Você não está em nenhuma escala dos próximos cultos.</p>
          )}
        </section>
      ) : (
        <div className="dashboard-stats">
          <div className="stat-card">
            <span className="stat-icon">
              <CalendarDays />
            </span>
            <div>
              <strong>{upcoming.length}</strong>
              <span>próximos cultos</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">
              <Music2 />
            </span>
            <div>
              <strong>{data.songs.length}</strong>
              <span>músicas na biblioteca</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">
              <Users />
            </span>
            <div>
              <strong>{data.people.filter(person => person.active !== false).length}</strong>
              <span>pessoas na equipe</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
