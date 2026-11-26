import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Cake,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Headphones,
  ImageUp,
  LoaderCircle,
  MessageCircle,
  Mic2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import ProfileAvatar from './ProfileAvatar';
import { StatusBadge } from './PresenceButtons';
import { FormError } from './ui';
import { getPersonPhoto } from '../lib/avatars';
import { PHOTO_INPUT_ACCEPT, preprocessProfilePhoto } from '../lib/profile-photo';
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

/** Cover with photo, name, functions, birthday, WhatsApp and a quick count of what the person served. */
export function ProfileHero({
  person,
  name,
  subtitle,
  stats,
  photoUrl,
  photoAction,
  notice,
}: {
  person?: Person;
  name: string;
  subtitle: string;
  stats?: PersonStats;
  photoUrl?: string;
  photoAction?: ReactNode;
  notice?: PhotoNotice | null;
}) {
  const birthday = person ? formatBirthday(person) : '';
  return (
    <section className="member-hero" aria-label="Resumo do perfil">
      <div className="member-hero-cover" aria-hidden="true" />
      <div className="member-hero-body">
        <div className="member-hero-avatar-wrap">
          <ProfileAvatar name={name} photoUrl={photoUrl ?? getPersonPhoto(person)} size={88} className="member-hero-avatar" decorative />
          {photoAction}
        </div>
        <div className="member-hero-text">
          <h2>{name}</h2>
          <p>
            {subtitle}
            {stats?.since && ` · desde ${sinceLabel(stats.since)}`}
          </p>
          <p className={`member-hero-notice ${notice?.kind === 'error' ? 'member-hero-notice-error' : ''}`} role="status">
            {notice && (notice.kind === 'ok' ? <Check size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />)}
            {notice?.text}
          </p>
        </div>
        {(person?.functions.length || birthday || person?.whatsapp) && (
          <div className="member-hero-tags">
            {person?.functions.map(item => (
              <span key={item} className="member-chip">
                {item}
              </span>
            ))}
            {birthday && (
              <span className="member-chip member-chip-soft">
                <Cake size={13} aria-hidden="true" /> {birthday}
              </span>
            )}
            {person?.whatsapp && (
              <a
                className="member-chip member-chip-whatsapp"
                href={whatsappLink(person.whatsapp)}
                target="_blank"
                rel="noreferrer"
                aria-label={`WhatsApp de ${name}`}
              >
                <MessageCircle size={13} aria-hidden="true" /> {formatWhatsapp(person.whatsapp)}
              </a>
            )}
          </div>
        )}
        {stats && (
          <dl className="member-stats">
            <div>
              <dt>{stats.month === 1 ? 'escala no mês' : 'escalas no mês'}</dt>
              <dd>{stats.month}</dd>
            </div>
            <div>
              <dt>no ano</dt>
              <dd>{stats.year}</dd>
            </div>
            <div>
              <dt>{stats.songs === 1 ? 'música tocada' : 'músicas tocadas'}</dt>
              <dd>{stats.songs}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

export type PhotoNotice = { kind: 'ok' | 'error' | 'busy'; text: string };

/** Camera on the cover: choosing a photo saves it right away; the menu also removes it. */
export function HeroPhotoButton({
  hasOwnPhoto,
  hasTeamPhoto,
  onNotice,
}: {
  hasOwnPhoto: boolean;
  hasTeamPhoto: boolean;
  onNotice: (notice: PhotoNotice | null) => void;
}) {
  const { busy, updateProfilePhoto } = useMinistry();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const blocked = busy || working;

  async function save(photo: Blob | null, prepare?: () => Promise<Blob>) {
    setWorking(true);
    onNotice({ kind: 'busy', text: photo === null && !prepare ? 'Removendo foto…' : 'Salvando foto…' });
    try {
      await updateProfilePhoto(prepare ? await prepare() : photo);
      onNotice({
        kind: 'ok',
        text: prepare
          ? 'Foto atualizada. Ela já aparece para a equipe.'
          : hasTeamPhoto
            ? 'Foto removida. Voltamos a usar a foto da equipe.'
            : 'Foto removida.',
      });
    } catch (cause) {
      onNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Não foi possível salvar a foto. Tente novamente.' });
    } finally {
      setWorking(false);
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || blocked) return;
    void save(null, () => preprocessProfilePhoto(file));
  }

  return (
    <div className="member-hero-camera-wrap" ref={wrap}>
      <input
        ref={input}
        className="member-hero-file"
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        aria-label="Escolher foto"
        tabIndex={-1}
        disabled={blocked}
        onChange={choose}
      />
      <button
        ref={button}
        type="button"
        className="member-hero-camera"
        aria-label="Alterar foto de perfil"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={blocked}
        onClick={() => {
          if (!hasOwnPhoto) {
            input.current?.click();
            return;
          }
          setOpen(value => !value);
        }}
      >
        {working ? <LoaderCircle size={15} className="spin" /> : <Camera size={15} />}
      </button>
      {open && (
        <div className="member-photo-menu" id={menuId} role="menu" aria-label="Foto de perfil">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              input.current?.click();
            }}
          >
            <ImageUp size={16} aria-hidden="true" />
            Escolher nova foto
          </button>
          <button
            type="button"
            role="menuitem"
            className="member-photo-menu-danger"
            onClick={() => {
              setOpen(false);
              void save(null);
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            Remover foto
          </button>
        </div>
      )}
    </div>
  );
}

/** Shows the first items and a button for the rest, so long lists don't stretch the page. */
function useShowMore<T>(items: T[], first: number) {
  const [open, setOpen] = useState(false);
  const visible = open ? items : items.slice(0, first);
  const button =
    items.length > first ? (
      <button type="button" className="member-more" onClick={() => setOpen(value => !value)}>
        {open ? 'Mostrar menos' : `Ver todas (${items.length})`}
        <ChevronDown size={15} className={open ? 'member-more-open' : undefined} aria-hidden="true" />
      </button>
    ) : null;
  return { visible, button };
}

export function UpcomingServicesCard({
  personId,
  today,
  limit = 3,
  title = 'Minhas próximas escalas',
}: {
  personId: string;
  today: string;
  limit?: number;
  title?: string;
}) {
  const { data, presenceEnabled } = useMinistry();
  const all = [...data.services]
    .filter(service => service.date >= today && service.assignments.some(item => item.personId === personId))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const { visible: upcoming, button } = useShowMore(all, limit);
  return (
    <section className="card member-card" aria-labelledby="member-upcoming">
      <h2 id="member-upcoming">
        <span className="member-card-icon">
          <CalendarDays size={16} />
        </span>
        {title}
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
      {button}
    </section>
  );
}

export function RehearsalCard({ personId, today }: { personId: string; today: string }) {
  const { data } = useMinistry();
  const { visible: songs, button } = useShowMore(songsToRehearse(data, personId, today), 4);
  if (!songs.length)
    return (
      <section className="card member-card" aria-labelledby="member-rehearsal">
        <h2 id="member-rehearsal">
          <span className="member-card-icon">
            <Headphones size={16} />
          </span>
          Para ensaiar
        </h2>
        <p className="muted member-empty">Quando você estiver numa escala com repertório, as músicas aparecem aqui.</p>
      </section>
    );
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
      {button}
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
  const { visible: shownKeys, button: keysButton } = useShowMore(mine, 5);
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
          {shownKeys.map(item => (
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
      {keysButton}
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
      {stats.perMonth.every(item => !item.count) ? (
        <p className="muted member-empty">Nenhuma escala nos últimos seis meses.</p>
      ) : (
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
      )}
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
  const changed =
    name.trim() !== person.name ||
    FUNCTIONS.filter(item => functions.includes(item)).join() !== FUNCTIONS.filter(item => person.functions.includes(item)).join() ||
    day !== (person.birthDay ? String(person.birthDay) : '') ||
    month !== (person.birthMonth ? String(person.birthMonth) : '') ||
    whatsapp !== formatWhatsapp(person.whatsapp);
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
          <button className="button button-primary" disabled={disabled || !changed}>
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
      <UpcomingServicesCard personId={person.id} today={today} limit={3} title="Próximas escalas" />
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
