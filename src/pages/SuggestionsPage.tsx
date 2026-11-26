import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  CircleX,
  ExternalLink,
  Eye,
  Heart,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useMinistry } from '../context/MinistryContext';
import { EmptyState, FormError, Modal, PageHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import { getPersonPhoto } from '../lib/avatars';
import { KEYS } from '../lib/music';
import { buildYouTubeSearchUrl, getYouTubeVideoId, searchYouTubeVideos, youtubeThumbnailUrl, type YouTubeSuggestion } from '../lib/youtube';
import {
  DECIDED_DAYS,
  OPEN_DAYS,
  SUGGESTION_STATUS_LABELS,
  findSuggestionDuplicates,
  guessSongFromVideo,
  relativeTime,
  sortSuggestions,
  suggestionView,
  type SuggestionSort,
  type SuggestionView,
} from '../lib/suggestions';
import type { SongSuggestion, Tag } from '../types';
import './suggestions.css';

const VIEWS: { id: SuggestionView; label: string }[] = [
  { id: 'open', label: 'Em aberto' },
  { id: 'decided', label: 'Decididas' },
  { id: 'archive', label: 'Arquivo' },
];
const youtubeWatch = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

export default function SuggestionsPage() {
  const { data, profile, suggestionsEnabled, canPlan } = useMinistry();
  const [view, setView] = useState<SuggestionView>('open');
  const [sort, setSort] = useState<SuggestionSort>('recent');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [approving, setApproving] = useState<SongSuggestion | null>(null);
  const [declining, setDeclining] = useState<SongSuggestion | null>(null);
  const [deleting, setDeleting] = useState<SongSuggestion | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const all = useMemo(() => data.suggestions ?? [], [data.suggestions]);
  const grouped = useMemo(() => {
    const now = Date.now();
    const groups: Record<SuggestionView, SongSuggestion[]> = { open: [], decided: [], archive: [] };
    for (const item of all) groups[suggestionView(item, now)].push(item);
    return groups;
  }, [all]);
  const visible = useMemo(
    () =>
      sortSuggestions(
        grouped[view].filter(item => tagFilter.every(id => item.tagIds.includes(id))),
        sort,
      ),
    [grouped, view, sort, tagFilter],
  );
  const usedTags = data.tags.filter(tag => all.some(item => item.tagIds.includes(tag.id)));

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`sugestao-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setHighlight(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  if (!suggestionsEnabled) {
    return (
      <>
        <PageHeader eyebrow="IDEIAS DA EQUIPE" title="Sugestões de louvores" />
        <section className="card sug-setup">
          <Lightbulb size={26} />
          <div>
            <h2>Quase pronto</h2>
            <p>
              Esta aba precisa de uma atualização no banco de dados.{' '}
              {profile?.role === 'admin'
                ? 'Rode o arquivo 011_song_suggestions.sql no SQL Editor do Supabase e recarregue a página.'
                : 'Peça a um administrador para fazer a atualização.'}
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="IDEIAS DA EQUIPE"
        title="Sugestões de louvores"
        description="Viu um louvor que a equipe deveria aprender? Sugira aqui. Curta e comente as ideias dos outros; o líder decide o que entra na Biblioteca."
        action={
          <button className="button button-primary" onClick={() => setComposing(true)}>
            <Plus size={17} />
            Sugerir louvor
          </button>
        }
      />

      <section className="card sug-filters" aria-label="Filtrar sugestões">
        <div className="sug-filter-row">
          <div className="segmented sug-views" role="tablist" aria-label="Quais sugestões mostrar">
            {VIEWS.map(option => (
              <button
                key={option.id}
                role="tab"
                aria-selected={view === option.id}
                className={view === option.id ? 'active' : ''}
                onClick={() => setView(option.id)}
              >
                {option.label}
                <span className="sug-count">{grouped[option.id].length}</span>
              </button>
            ))}
          </div>
          <div className="segmented sug-sort" role="group" aria-label="Ordenar">
            <button className={sort === 'recent' ? 'active' : ''} aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>
              Recentes
            </button>
            <button className={sort === 'votes' ? 'active' : ''} aria-pressed={sort === 'votes'} onClick={() => setSort('votes')}>
              <Heart size={13} />
              Mais curtidas
            </button>
          </div>
        </div>
        {usedTags.length > 0 && (
          <div className="chips sug-tag-filter" role="group" aria-label="Filtrar por etiquetas">
            {usedTags.map(tag => {
              const active = tagFilter.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  className={`chip ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setTagFilter(current => (active ? current.filter(id => id !== tag.id) : [...current, tag.id]))}
                >
                  {active && <Check size={13} />}
                  <span className="sug-dot" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="sug-rule">
          {view === 'open'
            ? `Sugestões sem curtidas ou comentários por ${OPEN_DAYS} dias vão para o Arquivo.`
            : view === 'decided'
              ? `Aprovadas e recusadas ficam aqui por ${DECIDED_DAYS} dias. Depois vão para o Arquivo.`
              : 'Sugestões antigas, já decididas ou sem movimento. Curtir ou comentar traz de volta as que ainda estão em aberto.'}
        </p>
      </section>

      {visible.length ? (
        <div className="sug-list">
          {visible.map(item => (
            <SuggestionCard
              key={item.id}
              item={item}
              tags={data.tags}
              highlighted={highlight === item.id}
              onApprove={() => setApproving(item)}
              onDecline={() => setDeclining(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState
            title={
              tagFilter.length
                ? 'Nenhuma sugestão com essas etiquetas'
                : view === 'open'
                  ? 'Nenhuma sugestão em aberto'
                  : view === 'decided'
                    ? 'Nenhuma decisão recente'
                    : 'O arquivo está vazio'
            }
            description={
              view === 'open' && !tagFilter.length
                ? 'Que louvor a equipe deveria aprender? Busque no YouTube e compartilhe com todos.'
                : undefined
            }
            action={
              view === 'open' && !tagFilter.length ? (
                <button className="button button-primary" onClick={() => setComposing(true)}>
                  <Plus size={17} />
                  Sugerir louvor
                </button>
              ) : undefined
            }
          />
        </section>
      )}

      {composing && (
        <SuggestionComposer
          onClose={() => setComposing(false)}
          onShowExisting={id => {
            setComposing(false);
            const item = all.find(entry => entry.id === id);
            if (item) setView(suggestionView(item));
            setTagFilter([]);
            setHighlight(id);
          }}
        />
      )}
      {approving && canPlan && <ApproveDialog item={approving} onClose={() => setApproving(null)} />}
      {declining && canPlan && <DeclineDialog item={declining} onClose={() => setDeclining(null)} />}
      {deleting && <DeleteDialog item={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

function SuggestionCard({
  item,
  tags,
  highlighted,
  onApprove,
  onDecline,
  onDelete,
}: {
  item: SongSuggestion;
  tags: Tag[];
  highlighted: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onDelete: () => void;
}) {
  const { data, canPlan, busy, voteSuggestion, setSuggestionStatus, offlineSavedAt } = useMinistry();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = data.people.find(person => person.id === item.authorPersonId);
  const song = item.songId ? data.songs.find(entry => entry.id === item.songId) : undefined;
  const open = item.status === 'suggested' || item.status === 'reviewing';
  const canDelete = canPlan || (item.mine && item.status === 'suggested');
  const readOnly = Boolean(offlineSavedAt);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível salvar.'));
    }
  }

  return (
    <article id={`sugestao-${item.id}`} className={`card sug-card sug-${item.status}${highlighted ? ' sug-highlight' : ''}`}>
      <div className="sug-main">
        <a
          className="sug-thumb"
          href={youtubeWatch(item.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Assistir ${item.title} no YouTube`}
        >
          <img src={youtubeThumbnailUrl(item.videoId) || ''} alt="" loading="lazy" decoding="async" width={480} height={360} />
          <span className="sug-play" aria-hidden="true">
            <Play size={16} fill="currentColor" />
          </span>
        </a>
        <div className="sug-body">
          <div className="sug-meta">
            <span className={`sug-status sug-status-${item.status}`}>{SUGGESTION_STATUS_LABELS[item.status]}</span>
            <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
          </div>
          <h3>{item.title}</h3>
          <p className="sug-artist">{item.artist}</p>
          {item.tagIds.length > 0 && (
            <div className="sug-tags">
              {tags
                .filter(tag => item.tagIds.includes(tag.id))
                .map(tag => (
                  <span key={tag.id} className="sug-tag">
                    <span className="sug-dot" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {item.status === 'approved' &&
        (song ? (
          <Link className="sug-outcome sug-outcome-approved" to={`/musicas/${song.id}`}>
            <CircleCheck size={16} />
            <span>
              Na Biblioteca como <strong>{song.title}</strong>
            </span>
            <ArrowUpRight size={15} />
          </Link>
        ) : (
          <p className="sug-outcome sug-outcome-approved">
            <CircleCheck size={16} />
            Aprovada. A música foi removida da Biblioteca depois.
          </p>
        ))}
      {item.status === 'declined' && (
        <p className="sug-outcome sug-outcome-declined">
          <CircleX size={16} />
          <span>{item.statusNote ? `Recusada: ${item.statusNote}` : 'Recusada pelo líder.'}</span>
        </p>
      )}

      <footer className="sug-footer">
        <span className="sug-author">
          <ProfileAvatar name={item.authorName} photoUrl={getPersonPhoto(author)} size={26} decorative />
          <span>
            {item.mine ? 'Você sugeriu' : 'Sugerida por'} {!item.mine && <strong>{author?.name || item.authorName}</strong>}
          </span>
        </span>
        <div className="sug-social">
          <button
            className={`sug-like${item.votedByMe ? ' active' : ''}`}
            aria-pressed={item.votedByMe}
            aria-label={`${item.votedByMe ? 'Descurtir' : 'Curtir'} ${item.title}. ${item.votes} ${item.votes === 1 ? 'curtida' : 'curtidas'}`}
            disabled={busy || readOnly}
            onClick={() => void run(() => voteSuggestion(item.id, !item.votedByMe))}
          >
            <Heart size={16} fill={item.votedByMe ? 'currentColor' : 'none'} />
            {item.votes}
          </button>
          <button
            className={`sug-comment-toggle${commentsOpen ? ' active' : ''}`}
            aria-expanded={commentsOpen}
            aria-label={`Comentários (${item.comments.length})`}
            onClick={() => setCommentsOpen(value => !value)}
          >
            <MessageCircle size={16} />
            {item.comments.length}
          </button>
          {canDelete && (
            <button className="sug-icon" aria-label={`Excluir a sugestão ${item.title}`} disabled={busy || readOnly} onClick={onDelete}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </footer>

      {canPlan && open && (
        <div className="sug-leader" role="group" aria-label="Decisão do líder">
          <span>Decisão</span>
          <button
            className={`button button-secondary${item.status === 'reviewing' ? ' sug-on' : ''}`}
            aria-pressed={item.status === 'reviewing'}
            disabled={busy}
            onClick={() => void run(() => setSuggestionStatus(item.id, item.status === 'reviewing' ? 'suggested' : 'reviewing'))}
          >
            <Eye size={15} />
            Em avaliação
          </button>
          <button className="button button-secondary sug-decline" disabled={busy} onClick={onDecline}>
            <X size={15} />
            Recusar
          </button>
          <button className="button button-primary" disabled={busy} onClick={onApprove}>
            <Check size={15} />
            Aprovar
          </button>
        </div>
      )}
      {canPlan && item.status === 'declined' && (
        <div className="sug-leader">
          <button className="button button-ghost" disabled={busy} onClick={() => void run(() => setSuggestionStatus(item.id, 'suggested'))}>
            <RotateCcw size={14} />
            Reabrir sugestão
          </button>
        </div>
      )}
      <FormError error={error} />
      {commentsOpen && <SuggestionComments item={item} />}
    </article>
  );
}

function SuggestionComments({ item }: { item: SongSuggestion }) {
  const { data, busy, canPlan, offlineSavedAt, commentSuggestion, deleteSuggestionComment } = useMinistry();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await commentSuggestion(item.id, text);
      setText('');
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível comentar.'));
    }
  }

  return (
    <section className="sug-comments" aria-label={`Comentários sobre ${item.title}`}>
      {item.comments.length ? (
        <ul>
          {item.comments.map(comment => {
            const person = data.people.find(entry => entry.id === comment.authorPersonId);
            return (
              <li key={comment.id}>
                <ProfileAvatar name={comment.authorName} photoUrl={getPersonPhoto(person)} size={28} decorative />
                <div>
                  <p className="sug-comment-head">
                    <strong>{person?.name || comment.authorName}</strong>
                    <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
                  </p>
                  <p className="sug-comment-body">{comment.body}</p>
                </div>
                {(comment.mine || canPlan) && (
                  <button
                    className="sug-icon"
                    aria-label="Apagar comentário"
                    disabled={busy || Boolean(offlineSavedAt)}
                    onClick={() =>
                      void deleteSuggestionComment(comment.id).catch(cause => setError(errorText(cause, 'Não foi possível apagar.')))
                    }
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sug-no-comments">Ninguém comentou ainda. Conte o que achou ou onde ela encaixa.</p>
      )}
      <form className="sug-comment-form" onSubmit={event => void submit(event)}>
        <label htmlFor={`${id}-comment`} className="sr-only">
          Escrever comentário
        </label>
        <input
          id={`${id}-comment`}
          value={text}
          maxLength={500}
          placeholder="Escreva um comentário…"
          onChange={event => setText(event.target.value)}
          disabled={Boolean(offlineSavedAt)}
        />
        <button className="button button-primary" disabled={busy || !text.trim() || Boolean(offlineSavedAt)} aria-label="Enviar comentário">
          <Send size={15} />
        </button>
      </form>
      <FormError error={error} />
    </section>
  );
}

interface PickedVideo {
  id: string;
  videoTitle: string;
  channel: string;
}

function SuggestionComposer({ onClose, onShowExisting }: { onClose: () => void; onShowExisting: (id: string) => void }) {
  const { data, busy, createSuggestion, voteSuggestion } = useMinistry();
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setSearchError(null);
    setSearched(false);
    try {
      const response = await searchYouTubeVideos(term, '', controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.results);
      setSearchError(response.results.length ? null : response.warning || null);
      setSearched(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResults([]);
      setSearchError(errorText(cause, 'Não foi possível buscar vídeos agora.'));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setSearching(false);
      }
    }
  }

  function pick(video: PickedVideo) {
    const guess = guessSongFromVideo(video.videoTitle, video.channel);
    setPicked(video);
    setTitle(guess.title || query.trim().slice(0, 160));
    setArtist(guess.artist);
    setError(null);
  }

  const pastedId = getYouTubeVideoId(pasted);
  const duplicates = picked ? findSuggestionDuplicates(title, picked.id, data.songs, data.suggestions) : null;
  const sameVideo = duplicates?.sameOpenVideo;

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setError(null);
    try {
      await createSuggestion({ title, artist, videoId: picked.id, videoTitle: picked.videoTitle, channel: picked.channel, tagIds });
      onClose();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível publicar a sugestão.'));
    }
  }

  return (
    <Modal title="Sugerir louvor" onClose={onClose} wide>
      {!picked ? (
        <div className="sug-composer">
          <p className="sug-composer-intro">Digite o nome do louvor ou do artista e escolha o vídeo que mostra a versão que você sugere.</p>
          <form className="sug-search" role="search" onSubmit={event => void search(event)}>
            <label htmlFor={`${id}-query`} className="sr-only">
              Nome do louvor ou artista
            </label>
            <span className="sug-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                id={`${id}-query`}
                type="search"
                value={query}
                maxLength={200}
                autoFocus
                placeholder="Ex.: Lugar secreto, Gabriela Rocha"
                onChange={event => setQuery(event.target.value)}
              />
            </span>
            <button className="button button-primary" disabled={searching || query.trim().length < 2}>
              {searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </form>
          {searchError && (
            <p className="sug-message" role="status">
              {searchError}
            </p>
          )}
          {searched && !results.length && !searchError && (
            <p className="sug-message" role="status">
              Nenhum vídeo encontrado. Tente outras palavras.
            </p>
          )}
          {results.length > 0 && (
            <ul className="sug-results" aria-label="Vídeos encontrados">
              {results.map(result => {
                const already = (data.suggestions ?? []).find(
                  item => item.videoId === result.id && (item.status === 'suggested' || item.status === 'reviewing'),
                );
                return (
                  <li key={result.id}>
                    <a href={result.url} target="_blank" rel="noopener noreferrer" aria-label={`Assistir ${result.title} no YouTube`}>
                      <img src={result.thumbnailUrl} alt="" loading="lazy" decoding="async" width={480} height={360} />
                    </a>
                    <span className="sug-result-text">
                      <strong>{result.title}</strong>
                      <small>{result.channel || 'YouTube'}</small>
                      {already && <em>Já sugerida por {already.authorName}</em>}
                    </span>
                    <button
                      type="button"
                      className="button button-secondary"
                      aria-label={`Escolher ${result.title}`}
                      onClick={() => pick({ id: result.id, videoTitle: result.title, channel: result.channel })}
                    >
                      Escolher
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="sug-paste">
            <label className="field">
              <span>Ou cole o link do vídeo</span>
              <input
                type="url"
                value={pasted}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={event => setPasted(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="button button-secondary"
              disabled={!pastedId}
              onClick={() => pastedId && pick({ id: pastedId, videoTitle: '', channel: '' })}
            >
              Usar este link
            </button>
          </div>
          {query.trim().length >= 2 && (
            <a className="text-link" href={buildYouTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer">
              Abrir a busca no YouTube <ExternalLink size={12} />
            </a>
          )}
        </div>
      ) : (
        <form className="sug-composer" onSubmit={event => void publish(event)}>
          <div className="sug-picked">
            <img src={youtubeThumbnailUrl(picked.id) || ''} alt="" width={480} height={360} />
            <span>
              <small>Vídeo escolhido</small>
              <strong>{picked.videoTitle || 'Vídeo do YouTube'}</strong>
              {picked.channel && <small>{picked.channel}</small>}
            </span>
            <button type="button" className="button button-ghost" onClick={() => setPicked(null)}>
              Trocar
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Louvor</span>
              <input value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>Artista ou ministério</span>
              <input value={artist} maxLength={160} required onChange={event => setArtist(event.target.value)} />
            </label>
          </div>
          {data.tags.length > 0 && (
            <fieldset className="sug-tags-field">
              <legend>
                Etiquetas <span className="sug-optional">opcional · ajudam a saber onde ela encaixa</span>
              </legend>
              <div className="chips">
                {data.tags.map(tag => {
                  const active = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`chip ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      onClick={() => setTagIds(current => (active ? current.filter(item => item !== tag.id) : [...current, tag.id]))}
                    >
                      {active && <Check size={13} />}
                      <span className="sug-dot" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {sameVideo ? (
            <div className="sug-warning sug-warning-strong" role="alert">
              <TriangleAlert size={17} />
              <div>
                <strong>Este vídeo já foi sugerido por {sameVideo.authorName}.</strong>
                <p>Em vez de repetir, curta a sugestão que já existe para ela subir na lista.</p>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() =>
                    void (sameVideo.votedByMe ? Promise.resolve() : voteSuggestion(sameVideo.id, true))
                      .then(() => onShowExisting(sameVideo.id))
                      .catch(cause => setError(errorText(cause, 'Não foi possível curtir.')))
                  }
                >
                  <Heart size={15} />
                  {sameVideo.votedByMe ? 'Ver a sugestão' : 'Curtir a sugestão existente'}
                </button>
              </div>
            </div>
          ) : (
            duplicates &&
            (duplicates.songs.length > 0 || duplicates.suggestions.length > 0) && (
              <div className="sug-warning" role="status">
                <TriangleAlert size={17} />
                <div>
                  {duplicates.songs.map(song => (
                    <p key={song.id}>
                      <strong>{song.title}</strong> ({song.artist}) já está na Biblioteca.{' '}
                      <Link to={`/musicas/${song.id}`} target="_blank">
                        Abrir
                      </Link>
                    </p>
                  ))}
                  {duplicates.suggestions.map(item => (
                    <p key={item.id}>
                      {item.authorName} já sugeriu <strong>{item.title}</strong> ({SUGGESTION_STATUS_LABELS[item.status].toLowerCase()}).
                    </p>
                  ))}
                  <p className="muted">Se for outra versão ou outra música com o mesmo nome, pode publicar assim mesmo.</p>
                </div>
              </div>
            )
          )}
          <FormError error={error} />
          <div className="form-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy || Boolean(sameVideo) || !title.trim() || !artist.trim()}>
              {busy ? <LoaderCircle className="spin" size={15} /> : <Lightbulb size={15} />}
              Publicar sugestão
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ApproveDialog({ item, onClose }: { item: SongSuggestion; onClose: () => void }) {
  const { data, busy, approveSuggestion } = useMinistry();
  const sameTitle = findSuggestionDuplicates(item.title, item.videoId, data.songs).songs;
  const [linkTo, setLinkTo] = useState<string>('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await approveSuggestion(item.id, linkTo ? null : key, linkTo || null);
      onClose();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível aprovar.'));
    }
  }

  return (
    <Modal title="Aprovar sugestão" onClose={onClose}>
      <form onSubmit={event => void submit(event)} className="sug-dialog">
        <p>
          <strong>{item.title}</strong> ({item.artist}) entra na Biblioteca com o vídeo e as etiquetas da sugestão. A letra e a cifra ficam
          pendentes para alguém completar depois.
        </p>
        {sameTitle.length > 0 && (
          <fieldset className="sug-choice">
            <legend>Já existe uma música com esse nome na Biblioteca</legend>
            <label>
              <input type="radio" name="destino" checked={!linkTo} onChange={() => setLinkTo('')} />
              Criar uma nova música
            </label>
            {sameTitle.map(song => (
              <label key={song.id}>
                <input type="radio" name="destino" checked={linkTo === song.id} onChange={() => setLinkTo(song.id)} />
                Marcar como aprovada usando “{song.title}” ({song.artist})
              </label>
            ))}
          </fieldset>
        )}
        {!linkTo && (
          <label className="field">
            <span>Tom da igreja</span>
            <select value={key} required onChange={event => setKey(event.target.value)}>
              <option value="">Escolha o tom</option>
              {KEYS.map(option => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <small>Dá para ajustar depois, ao colocar a cifra.</small>
          </label>
        )}
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy || (!linkTo && !key)}>
            <Check size={15} />
            {linkTo ? 'Aprovar' : 'Aprovar e adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineDialog({ item, onClose }: { item: SongSuggestion; onClose: () => void }) {
  const { busy, setSuggestionStatus } = useMinistry();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await setSuggestionStatus(item.id, 'declined', note);
      onClose();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível recusar.'));
    }
  }
  return (
    <Modal title="Recusar sugestão" onClose={onClose}>
      <form onSubmit={event => void submit(event)} className="sug-dialog">
        <p>
          <strong>{item.title}</strong> sai da lista em aberto e fica em Decididas por {DECIDED_DAYS} dias. Você pode reabrir depois.
        </p>
        <label className="field">
          <span>
            Motivo <span className="sug-optional">opcional, aparece para a equipe</span>
          </span>
          <input
            value={note}
            maxLength={300}
            placeholder="Ex.: tom muito alto para o grupo"
            onChange={event => setNote(event.target.value)}
          />
        </label>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button-danger" disabled={busy}>
            <X size={15} />
            Recusar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ item, onClose }: { item: SongSuggestion; onClose: () => void }) {
  const { busy, deleteSuggestion } = useMinistry();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Excluir sugestão" onClose={onClose}>
      <div className="sug-dialog">
        <p>
          Excluir <strong>{item.title}</strong> com as curtidas e os comentários? Para só tirar da lista, deixe que ela vá para o Arquivo
          sozinha.
        </p>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={() =>
              void deleteSuggestion(item.id)
                .then(onClose)
                .catch(cause => setError(errorText(cause, 'Não foi possível excluir.')))
            }
          >
            <Trash2 size={15} />
            Excluir
          </button>
        </div>
      </div>
    </Modal>
  );
}
