import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, History } from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { ministryToday } from '../lib/analytics';
import { buildSongHistory, type SongHistoryEntry } from '../lib/song-history';
import './song-history.css';

const SHOWN = 5;
const fullDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(/\./g, '')
    .replace(/ de /g, ' ');

/** "hoje", "há 3 dias", "há 2 semanas", "há 4 meses"… between two calendar days. */
export function timeAgo(date: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 14) return `há ${days} dias`;
  if (days < 60) return `há ${Math.floor(days / 7)} semanas`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}

function Entry({ entry }: { entry: SongHistoryEntry }) {
  return (
    <li>
      <Link to={`/cultos/${entry.serviceId}`} className="song-history-entry">
        <span className="song-history-date">{fullDate(entry.date)}</span>
        <span className="song-history-type">
          {entry.type || 'Culto'}
          {entry.time && <small> · {entry.time}</small>}
        </span>
        <span
          className={`song-history-key${entry.keyFromService ? '' : ' song-history-key-default'}`}
          title={entry.keyFromService ? 'Tom salvo neste culto' : 'Sem tom salvo no culto: mostra o tom na igreja'}
        >
          {entry.key || '—'}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function SongHistoryCard({ songId }: { songId: string }) {
  const { data } = useMinistry();
  const today = ministryToday();
  const history = useMemo(() => buildSongHistory(data, songId, today), [data, songId, today]);
  const [showAll, setShowAll] = useState(false);
  const played = showAll ? history.played : history.played.slice(0, SHOWN);
  const topKey = history.keys[0];

  return (
    <section className="card song-history" aria-labelledby="song-history-heading">
      <h2 id="song-history-heading">
        <History size={18} />
        Histórico nos cultos
      </h2>
      {!history.played.length && !history.upcoming.length ? (
        <p className="muted">Esta música ainda não entrou em nenhum repertório.</p>
      ) : (
        <>
          <dl className="song-history-stats">
            <div>
              <dt>Vezes tocada</dt>
              <dd>{history.played.length}</dd>
              <small>{history.firstDate ? `desde ${fullDate(history.firstDate)}` : 'nenhum culto até hoje'}</small>
            </div>
            <div>
              <dt>Última vez</dt>
              <dd>{history.lastDate ? timeAgo(history.lastDate, today) : '—'}</dd>
              <small>{history.lastDate ? fullDate(history.lastDate) : 'ainda não foi tocada'}</small>
            </div>
            <div>
              <dt>Tom mais usado</dt>
              <dd>{topKey?.key || '—'}</dd>
              <small>
                {history.keys.length > 1
                  ? history.keys.map(row => `${row.key} ${row.count}×`).join(' · ')
                  : topKey
                    ? `em ${topKey.count === 1 ? '1 culto' : `${topKey.count} cultos`}`
                    : 'sem tom registrado'}
              </small>
            </div>
          </dl>
          {history.upcoming.length > 0 && (
            <div className="song-history-group">
              <h3>
                <CalendarClock size={15} />
                Próximos cultos
              </h3>
              <ul className="song-history-list">
                {history.upcoming.map(entry => (
                  <Entry key={entry.serviceId} entry={entry} />
                ))}
              </ul>
            </div>
          )}
          {history.played.length > 0 && (
            <div className="song-history-group">
              <h3>Cultos em que foi tocada</h3>
              <ul className="song-history-list">
                {played.map(entry => (
                  <Entry key={entry.serviceId} entry={entry} />
                ))}
              </ul>
              {history.played.length > SHOWN && (
                <button type="button" className="button button-ghost song-history-more" onClick={() => setShowAll(value => !value)}>
                  {showAll ? 'Mostrar menos' : `Ver todos os ${history.played.length} cultos`}
                </button>
              )}
            </div>
          )}
          {history.played.some(entry => !entry.keyFromService) && (
            <p className="song-history-hint">Tom em cinza: o culto não tinha tom salvo, então aparece o tom na igreja.</p>
          )}
        </>
      )}
    </section>
  );
}
