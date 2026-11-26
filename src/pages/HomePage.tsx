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
import './home.css';

function birthdayWhen(person: Person, inDays: number) {
  if (inDays === 0) return 'Hoje! 🎉';
  if (inDays === 1) return 'Amanhã';
  const date = new Date(Date.UTC(2000, person.birthMonth! - 1, person.birthDay!));
  return sentenceCase(date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })) + ` · em ${inDays} dias`;
}

/** Team birthdays in the next seven days. */
function BirthdaysCard({
  people,
  today,
  myPersonId,
  className = '',
}: {
  people: Person[];
  today: string;
  myPersonId?: string;
  className?: string;
}) {
  const birthdays = upcomingBirthdays(people, today, 7);
  if (!birthdays.length) return null;
  return (
    <section className={`card member-birthdays ${className}`} aria-labelledby="birthdays-title">
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
  const later = upcoming.slice(1, 5);
  const birthdayToday = upcomingBirthdays(data.people, today, 0).length > 0;
  const todayLabel = sentenceCase(
    new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  );
  return (
    <>
      <PageHeader
        title={`Olá, ${profile?.name.split(' ')[0] || 'equipe'} 👋`}
        description={todayLabel}
        action={
          canPlan ? (
            <Link className="button button-primary" to="/cultos?novo=1">
              <Plus size={18} />
              Novo culto
            </Link>
          ) : undefined
        }
      />
      {birthdayToday && <BirthdaysCard people={data.people} today={today} myPersonId={profile?.personId} className="home-birthdays-top" />}
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
          <div className="dashboard-columns home-columns">
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
            <div className="home-side">
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
              {!birthdayToday && <BirthdaysCard people={data.people} today={today} myPersonId={profile?.personId} />}
            </div>
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
      {!next && !birthdayToday && <BirthdaysCard people={data.people} today={today} myPersonId={profile?.personId} />}
      {later.length > 0 && (
        <section className="card home-upcoming" aria-labelledby="home-upcoming-title">
          <div className="card-heading">
            <h2 id="home-upcoming-title">Próximos cultos</h2>
            <Link className="text-link" to="/cultos">
              Todos os cultos
              <ArrowRight size={15} />
            </Link>
          </div>
          <ul className="home-upcoming-list">
            {later.map(service => {
              const d = dateParts(service.date);
              const myAssignments = service.assignments.filter(a => a.personId === profile?.personId);
              return (
                <li key={service.id}>
                  <Link
                    to={`/cultos/${service.id}`}
                    className={myAssignments.length ? 'home-upcoming-row home-upcoming-mine' : 'home-upcoming-row'}
                  >
                    <span className="date-tile">
                      <strong>{d.day}</strong>
                      <span>{d.month}</span>
                    </span>
                    <span className="home-upcoming-text">
                      <strong>{service.type}</strong>
                      <small>
                        <Clock3 size={13} aria-hidden="true" /> {service.time} · {service.repertoire.length}{' '}
                        {service.repertoire.length === 1 ? 'música' : 'músicas'} · {service.assignments.length}{' '}
                        {service.assignments.length === 1 ? 'pessoa' : 'pessoas'}
                      </small>
                    </span>
                    {myAssignments.length > 0 && (
                      <span className="home-upcoming-you">
                        <span className="home-you-chip">Você: {myAssignments.map(a => a.function).join(', ')}</span>
                        {presenceEnabled && (
                          <StatusBadge
                            assignment={myAssignments[0]}
                            unavailableNote={unavailableOn(data, myAssignments[0].personId, service.date)?.note}
                          />
                        )}
                      </span>
                    )}
                    <ArrowRight size={16} className="home-upcoming-arrow" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!profile?.personId && (
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
