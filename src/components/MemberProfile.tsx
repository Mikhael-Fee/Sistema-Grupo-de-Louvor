import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Cake, CalendarDays, Check, Headphones, MessageCircle, Mic2, Plus, Save, X } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import ProfileAvatar from './ProfileAvatar';
import { StatusBadge } from './PresenceButtons';
import { FormError } from './ui';
import { getPersonPhoto } from '../lib/avatars';
import { KEYS } from '../lib/music';
import { unavailableOn } from '../lib/presence';
import {
  formatBirthday,
  formatWhatsapp,
  monthName,
  personStats,
  shortMonthName,
  songsToRehearse,
  whatsappLink,
  type PersonStats,
} from '../lib/member-profile';
import { FUNCTIONS, type Person } from '../types';
import { dateParts } from '../pages/HomePage';
import './member-profile.css';

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const sinceLabel = (date: string) => `${shortMonthName(Number(date.slice(5, 7)))}/${date.slice(0, 4)}`;

/** Photo, name, functions, birthday and a quick count of what the person served. */
export function ProfileHero({ person, name, subtitle, stats }: { person?: Person; name: string; subtitle: string; stats?: PersonStats }) {
  const birthday = person ? formatBirthday(person) : '';
  return (
    <section className="card member-hero" aria-label="Resumo do perfil">
      <div className="member-hero-identity">
        <ProfileAvatar name={name} photoUrl={getPersonPhoto(person)} size={68} className="member-hero-avatar" decorative />
        <div>
          <h2>{name}</h2>
          <p>
            {subtitle}
            {stats?.since && ` · servindo desde ${sinceLabel(stats.since)}`}
          </p>
          {(birthday || person?.whatsapp) && (
            <p className="member-hero-meta">
              {birthday && (
                <span>
                  <Cake size={14} aria-hidden="true" /> {birthday}
                </span>
              )}
              {person?.whatsapp && (
                <a href={whatsappLink(person.whatsapp)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${name}`}>
                  <MessageCircle size={14} aria-hidden="true" /> {formatWhatsapp(person.whatsapp)}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
      {person && (
        <div className="member-chips" aria-label="Funções">
          {person.functions.map(item => (
            <span key={item} className="member-chip">
              {item}
            </span>
          ))}
        </div>
      )}
      {stats && (
        <div className="member-stats">
          <div>
            <strong>{stats.month}</strong>
            <span>{stats.month === 1 ? 'escala no mês' : 'escalas no mês'}</span>
          </div>
          <div>
            <strong>{stats.year}</strong>
            <span>no ano</span>
          </div>
          <div>
            <strong>{stats.songs}</strong>
            <span>{stats.songs === 1 ? 'música tocada' : 'músicas tocadas'}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function UpcomingServicesCard({ personId, today, limit = 4 }: { personId: string; today: string; limit?: number }) {
  const { data, presenceEnabled } = useMinistry();
  const upcoming = [...data.services]
    .filter(service => service.date >= today && service.assignments.some(item => item.personId === personId))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, limit);
  return (
    <section className="card member-card" aria-labelledby="member-upcoming">
      <h2 id="member-upcoming">
        <span className="member-card-icon">
          <CalendarDays size={16} />
        </span>
        Minhas próximas escalas
      </h2>
      {upcoming.length ? (
        <ul className="member-list">
          {upcoming.map(service => {
            const d = dateParts(service.date);
            const mine = service.assignments.filter(item => item.personId === personId);
            const away = unavailableOn(data, personId, service.date);
            return (
              <li key={service.id}>
                <Link to={`/cultos/${service.id}`} className="member-row">
                  <span className="date-tile member-date">
                    <strong>{d.day}</strong>
                    <span>{d.month}</span>
                  </span>
                  <span className="member-row-text">
                    <strong>
                      {service.type} · {service.time}
                    </strong>
                    <small>
                      {mine.map(item => item.function).join(', ')} · {service.repertoire.length}{' '}
                      {service.repertoire.length === 1 ? 'música' : 'músicas'}
                    </small>
                  </span>
                  {presenceEnabled && <StatusBadge assignment={mine[0]} unavailableNote={away ? away.note : undefined} />}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted member-empty">Nenhuma escala nos próximos cultos.</p>
      )}
    </section>
  );
}

export function RehearsalCard({ personId, today }: { personId: string; today: string }) {
  const { data } = useMinistry();
  const songs = songsToRehearse(data, personId, today).slice(0, 8);
  if (!songs.length) return null;
  return (
    <section className="card member-card" aria-labelledby="member-rehearsal">
      <h2 id="member-rehearsal">
        <span className="member-card-icon">
          <Headphones size={16} />
        </span>
        Para ensaiar
      </h2>
      <p className="member-hint">Músicas das suas próximas escalas, no tom do culto.</p>
      <ul className="member-list">
        {songs.map(item => (
          <li key={item.song.id}>
            <Link to={`/musicas/${item.song.id}`} className="member-row">
              <span className="member-row-text">
                <strong>{item.song.title}</strong>
                <small>
                  {item.lastPlayed ? `Você tocou em ${shortDate(item.lastPlayed)}` : 'Primeira vez que você toca esta'} · culto de{' '}
                  {dateParts(item.serviceDate).day}/{item.serviceDate.slice(5, 7)}
                </small>
              </span>
              <span className="key-badge" aria-label={`Tom ${item.key}`}>
                {item.key}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The key the person sings each song in. Leaders see it as a suggestion when building the repertoire. */
export function SongKeysCard({ personId }: { personId: string }) {
  const { data, setSongKey, busy } = useMinistry();
  const [songId, setSongId] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mine = (data.songKeys ?? [])
    .filter(item => item.personId === personId)
    .map(item => ({ ...item, song: data.songs.find(song => song.id === item.songId) }))
    .filter(item => item.song)
    .sort((a, b) => a.song!.title.localeCompare(b.song!.title, 'pt-BR'));
  const available = [...data.songs]
    .filter(song => !mine.some(item => item.songId === song.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  const disabled = busy || saving;
  async function change(targetSong: string, nextKey: string) {
    setSaving(true);
    setError(null);
    try {
      await setSongKey(personId, targetSong, nextKey);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o tom.');
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    const song = data.songs.find(item => item.id === songId);
    if (!song) return;
    if (await change(song.id, key || song.churchKey || song.originalKey)) {
      setSongId('');
      setKey('');
    }
  }
  return (
    <section className="card member-card" aria-labelledby="member-keys">
      <h2 id="member-keys">
        <span className="member-card-icon">
          <Mic2 size={16} />
        </span>
        Meus tons
      </h2>
      <p className="member-hint">O tom em que você canta cada música. Quem monta o culto vê como sugestão quando você está na voz.</p>
      {mine.length > 0 && (
        <ul className="member-list">
          {mine.map(item => (
            <li key={item.songId} className="member-row">
              <span className="member-row-text">
                <strong>{item.song!.title}</strong>
                <small>Tom da igreja: {item.song!.churchKey || item.song!.originalKey}</small>
              </span>
              <select
                className="member-key-select"
                aria-label={`Meu tom em ${item.song!.title}`}
                value={item.key}
                disabled={disabled}
                onChange={event => void change(item.songId, event.target.value)}
              >
                {KEYS.map(option => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover meu tom de ${item.song!.title}`}
                disabled={disabled}
                onClick={() => void change(item.songId, '')}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="member-key-form" onSubmit={add}>
        <label className="field">
          Música
          <select
            value={songId}
            disabled={disabled || !available.length}
            onChange={event => {
              setSongId(event.target.value);
              const song = data.songs.find(item => item.id === event.target.value);
              setKey(song ? song.churchKey || song.originalKey : '');
            }}
          >
            <option value="">Escolha uma música</option>
            {available.map(song => (
              <option key={song.id} value={song.id}>
                {song.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Meu tom
          <select value={key} disabled={disabled || !songId} onChange={event => setKey(event.target.value)}>
            {!songId && <option value="">—</option>}
            {KEYS.map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="button button-secondary" disabled={disabled || !songId}>
          <Plus size={16} /> Adicionar tom
        </button>
      </form>
      <FormError error={error} />
    </section>
  );
}

export function HistoryCard({ stats }: { stats: PersonStats }) {
  const peak = Math.max(1, ...stats.perMonth.map(item => item.count));
  return (
    <section className="card member-card" aria-labelledby="member-history">
      <h2 id="member-history">
        <span className="member-card-icon">
          <BarChart3 size={16} />
        </span>
        Meu histórico
      </h2>
      {stats.perMonth.every(item => !item.count) && <p className="member-hint">Nenhuma escala nos últimos seis meses.</p>}
      <div className="member-bars" role="img" aria-label={stats.perMonth.map(item => `${item.label}: ${item.count}`).join(', ')}>
        {stats.perMonth.map((item, index) => (
          <div key={item.month} className="member-bar">
            <span className="member-bar-value">{item.count || ''}</span>
            <span
              className={`member-bar-fill ${index === stats.perMonth.length - 1 ? 'member-bar-current' : ''}`}
              style={{ height: `${Math.max(4, (item.count / peak) * 100)}%` }}
            />
            <span className="member-bar-label">{item.label}</span>
          </div>
        ))}
      </div>
      <ul className="member-list">
        <li className="member-row">
          <span className="member-row-text">
            <strong>Mais tocada por você</strong>
            <small>{stats.topSong ? `${stats.topSong.song.title} · ${stats.topSong.count}×` : 'Ainda sem músicas tocadas'}</small>
          </span>
        </li>
        <li className="member-row">
          <span className="member-row-text">
            <strong>Funções este ano</strong>
            <small>
              {stats.byFunction.length ? stats.byFunction.map(item => `${item.name} ${item.count}`).join(' · ') : 'Nenhuma escala este ano'}
            </small>
          </span>
        </li>
      </ul>
    </section>
  );
}

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** The member edits their own name, functions, birthday and WhatsApp. */
export function AboutMeForm({ person }: { person: Person }) {
  const { updateMyPerson, busy } = useMinistry();
  const [name, setName] = useState(person.name);
  const [functions, setFunctions] = useState<string[]>(person.functions);
  const [day, setDay] = useState(person.birthDay ? String(person.birthDay) : '');
  const [month, setMonth] = useState(person.birthMonth ? String(person.birthMonth) : '');
  const [whatsapp, setWhatsapp] = useState(formatWhatsapp(person.whatsapp));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || saving;
  const touch = () => {
    setSaved(false);
    setError(null);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if (Boolean(day) !== Boolean(month)) {
      setError('Escolha o dia e o mês do aniversário, ou deixe os dois vazios.');
      return;
    }
    setSaving(true);
    touch();
    try {
      await updateMyPerson({
        name,
        functions: FUNCTIONS.filter(item => functions.includes(item)),
        birthDay: day ? Number(day) : null,
        birthMonth: month ? Number(month) : null,
        whatsapp,
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar seus dados.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="card member-card" aria-labelledby="member-about">
      <h2 id="member-about">
        <span className="member-card-icon">
          <Cake size={16} />
        </span>
        Sobre mim
      </h2>
      <form className="member-about-form" onSubmit={submit}>
        <label className="field">
          Nome
          <input value={name} maxLength={160} required disabled={disabled} onChange={event => (setName(event.target.value), touch())} />
        </label>
        <fieldset className="member-functions" disabled={disabled}>
          <legend>Funções e instrumentos</legend>
          <div className="chips">
            {FUNCTIONS.map(item => {
              const active = functions.includes(item);
              return (
                <label key={item} className={`chip member-function-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={event => {
                      setFunctions(current => (event.target.checked ? [...current, item] : current.filter(value => value !== item)));
                      touch();
                    }}
                  />
                  {active && <Check size={13} aria-hidden="true" />}
                  {item}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="member-birthday">
          <label className="field">
            Dia do aniversário
            <select value={day} disabled={disabled} onChange={event => (setDay(event.target.value), touch())}>
              <option value="">—</option>
              {DAYS.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mês
            <select value={month} disabled={disabled} onChange={event => (setMonth(event.target.value), touch())}>
              <option value="">—</option>
              {MONTHS.map(value => (
                <option key={value} value={value}>
                  {monthName(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          WhatsApp <small>(opcional)</small>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            value={whatsapp}
            maxLength={24}
            disabled={disabled}
            onChange={event => (setWhatsapp(event.target.value), touch())}
          />
        </label>
        <p className="member-hint">
          O ano não é pedido. A equipe vê seu aniversário no Início e pode chamar você no WhatsApp pelo seu perfil.
        </p>
        <FormError error={error} />
        <div className="form-actions">
          <button className="button button-primary" disabled={disabled}>
            <Save size={16} />
            {saving ? 'Salvando…' : 'Salvar meus dados'}
          </button>
        </div>
        {saved && (
          <p className="profile-page-success" role="status">
            <Check size={16} /> Dados atualizados.
          </p>
        )}
      </form>
    </section>
  );
}

/** A team member's card opened from Equipe: what the rest of the team can see. */
export function PersonSummary({ person, today }: { person: Person; today: string }) {
  const { data } = useMinistry();
  const stats = personStats(data, person.id, today);
  const keys = (data.songKeys ?? [])
    .filter(item => item.personId === person.id)
    .map(item => ({ key: item.key, song: data.songs.find(song => song.id === item.songId) }))
    .filter(item => item.song)
    .sort((a, b) => a.song!.title.localeCompare(b.song!.title, 'pt-BR'));
  return (
    <div className="member-summary">
      <ProfileHero person={person} name={person.name} subtitle={person.functions.join(' · ')} stats={stats} />
      <UpcomingServicesCard personId={person.id} today={today} limit={3} />
      {keys.length > 0 && (
        <section className="card member-card" aria-label="Tons">
          <h2>
            <span className="member-card-icon">
              <Mic2 size={16} />
            </span>
            Tons de {person.name.split(' ')[0]}
          </h2>
          <ul className="member-list">
            {keys.map(item => (
              <li key={item.song!.id}>
                <Link to={`/musicas/${item.song!.id}`} className="member-row">
                  <span className="member-row-text">
                    <strong>{item.song!.title}</strong>
                    <small>Tom da igreja: {item.song!.churchKey || item.song!.originalKey}</small>
                  </span>
                  <span className="key-badge">{item.key}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
