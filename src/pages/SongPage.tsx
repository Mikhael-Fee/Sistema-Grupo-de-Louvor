import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  FileText,
  Maximize2,
  Minus,
  Music2,
  Pencil,
  Plus,
  Save,
  StickyNote,
  X,
} from 'lucide-react';
import { EmptyState, FormError } from '../components/ui';
import YoutubeVideoCard from '../components/YoutubeVideoCard';
import { useMinistry } from '../context/MinistryContext';
import { chordSegments, KEYS, stripChords, transposeContent } from '../lib/music';
import { cleanChordSheet } from '../lib/cifraclub';
import { sectionLabel } from '../lib/song-sections';
import { normalizeYouTubeUrl } from '../lib/youtube';
import { cifraClubUrlFromNotes, cifraClubSearchUrl } from '../lib/song-search';
import { isFirefoxInstalledApp } from '../lib/cifra-browser';
import { pendingCurrentTabImport } from '../lib/cifra-current-tab';
import { SongEditor } from './SongsPage';
import { useWakeLock } from '../hooks/useWakeLock';
import type { SetlistItem } from '../types';
import { arrowDirection, autoscrollPixelsPerSecond, setlistPosition, setlistSongPath, swipeDirection } from '../lib/setlist-navigation';

const SPEED_KEY = 'candeia.reader.scrollSpeed';
const FONT_KEY = 'candeia.reader.fontSize';
/** The letter size chosen on this device is kept for every song. */
function storedFontSize(): number {
  try {
    const value = Number(localStorage.getItem(FONT_KEY));
    return value >= 14 && value <= 28 ? value : 18;
  } catch {
    return 18;
  }
}
function storedSpeed(): number {
  try {
    const value = Number(localStorage.getItem(SPEED_KEY));
    return value >= 1 && value <= 8 ? value : 3;
  } catch {
    return 3;
  }
}
import './songs.css';

export default function SongPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data, canEditLibrary, canPlan, saveService, busy, profile } = useMinistry();
  const song = data.songs.find(item => item.id === id);
  const service = data.services.find(item => item.id === searchParams.get('service'));
  const setlistItem = service?.repertoire.find(item => item.id === searchParams.get('item') && item.songId === id);
  const defaultKey = setlistItem?.key || song?.churchKey || 'C';
  const [viewKey, setViewKey] = useState(defaultKey);
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(storedFontSize);
  const [reading, setReading] = useState(Boolean((location.state as { reading?: boolean } | null)?.reading));
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(storedSpeed);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing || !id || !profile || !canEditLibrary || !isFirefoxInstalledApp()) return;
    const { pending } = pendingCurrentTabImport(profile.id, null);
    // Back may reload the detail document instead of restoring the open editor.
    // Let the library resume/cancel the worker and reopen this same song draft.
    if (pending?.target === id) navigate(`/musicas?candeia_import=${pending.requestId}`, { replace: true });
  }, [editing, id, profile?.id, canEditLibrary, navigate]);

  useEffect(() => {
    setViewKey(defaultKey);
    setSaveError(null);
  }, [id, defaultKey]);
  useEffect(() => {
    setSaved(false);
  }, [id]);
  // Moving to the next song of the service keeps reading mode and starts at the top.
  useEffect(() => {
    setReading(Boolean((location.state as { reading?: boolean } | null)?.reading));
    setScrolling(false);
    readerRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  }, [id, setlistItem?.id]);
  // The screen must not go dark in the middle of a song.
  useWakeLock(Boolean(song));
  useEffect(() => {
    if (!reading) setScrolling(false);
  }, [reading]);
  useEffect(() => {
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      /* Preference only. */
    }
  }, [speed]);
  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      /* Preference only. */
    }
  }, [fontSize]);
  useEffect(() => {
    const target = readerRef.current;
    if (!scrolling || !target) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const step = (now: number) => {
      carry += ((now - last) / 1000) * autoscrollPixelsPerSecond(speed);
      last = now;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        target.scrollTop += whole;
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, speed]);
  useEffect(() => {
    const reader = readerRef.current;
    if (!reading || !song || !reader) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background: { element: HTMLElement; inert: boolean }[] = [];
    // Disable only siblings, never an ancestor containing the reading controls.
    let branch: HTMLElement = reader;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      if (parent === document.body) break;
      branch = parent;
    }
    document.body.style.overflow = 'hidden';
    const controls = () =>
      Array.from(
        reader.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter(element => element.getClientRects().length > 0);
    if (!reader.contains(document.activeElement)) (controls()[0] || reader).focus();
    const readingKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setReading(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = controls();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        reader.focus();
        return;
      }
      if (!reader.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', readingKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', readingKeys);
      for (const item of background) item.element.inert = item.inert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [reading, song?.id]);
  const content = useMemo(() => (song ? transposeContent(cleanChordSheet(song.content), song.originalKey, viewKey) : ''), [song, viewKey]);
  const changeKey = (key: string) => {
    setViewKey(key);
    setSaved(false);
    setSaveError(null);
  };
  const stepKey = (step: number) => {
    const index = KEYS.indexOf(viewKey);
    changeKey(KEYS[(Math.max(index, 0) + step + KEYS.length) % KEYS.length]);
  };

  async function saveKey() {
    if (!service || !setlistItem) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveService({
        ...service,
        repertoire: service.repertoire.map(item => (item.id === setlistItem.id ? { ...item, key: viewKey } : item)),
      });
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Não foi possível salvar o tom neste culto.');
    } finally {
      setSaving(false);
    }
  }

  // Next/previous song of the service: arrow keys on a computer, a sideways swipe on the phone.
  const stagePosition = setlistPosition(service, setlistItem?.id);
  const previousStep = stagePosition?.previous;
  const nextStep = stagePosition?.next;
  useEffect(() => {
    const page = readerRef.current;
    if (!service || !page || editing || (!previousStep && !nextStep)) return;
    const go = (direction: 'previous' | 'next') => {
      const target = direction === 'next' ? nextStep : previousStep;
      if (target) navigate(setlistSongPath(service.id, target), { state: { reading } });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector('dialog[open]')) return;
      const direction = arrowDirection(event.key, event.target);
      if (!direction) return;
      event.preventDefault();
      go(direction);
    };
    let start: { x: number; y: number; at: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start =
        event.touches.length === 1 && touch && !scrollsSideways(event.target, page)
          ? { x: touch.clientX, y: touch.clientY, at: performance.now() }
          : null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y, performance.now() - start.at);
      start = null;
      if (direction) go(direction);
    };
    const onCancel = () => {
      start = null;
    };
    window.addEventListener('keydown', onKey);
    page.addEventListener('touchstart', onStart, { passive: true });
    page.addEventListener('touchend', onEnd, { passive: true });
    page.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      page.removeEventListener('touchstart', onStart);
      page.removeEventListener('touchend', onEnd);
      page.removeEventListener('touchcancel', onCancel);
    };
  }, [service?.id, previousStep?.id, nextStep?.id, reading, editing, navigate, song?.id]);

  if (!song)
    return (
      <>
        <Link className="song-back" to="/musicas">
          <ArrowLeft size={16} />
          Voltar à biblioteca
        </Link>
        <div className="card">
          <EmptyState
            title="Música não encontrada"
            description="Ela pode ter sido removida da biblioteca."
            action={
              <Link className="button button-primary" to="/musicas">
                Abrir biblioteca
              </Link>
            }
          />
        </div>
      </>
    );
  const songTags = data.tags.filter(tag => song.tagIds.includes(tag.id));
  const serviceVideoUrl = normalizeYouTubeUrl(setlistItem?.youtubeUrl);
  const referenceVideoUrl = serviceVideoUrl || normalizeYouTubeUrl(song.youtubeUrl);
  const cifraClubUrl = cifraClubUrlFromNotes(song.notes) || cifraClubSearchUrl(song.title, song.artist);
  const position = stagePosition;
  const stepTitle = (item: SetlistItem) => data.songs.find(candidate => candidate.id === item.songId)?.title || 'Música do repertório';
  const serviceLabel = service
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date(`${service.date}T12:00:00`))
    : '';

  return (
    <div
      ref={readerRef}
      className={`song-page ${reading ? 'song-reading' : ''}`}
      role={reading ? 'dialog' : undefined}
      aria-modal={reading || undefined}
      aria-label={reading ? `Leitura de ${song.title}` : undefined}
      tabIndex={reading ? -1 : undefined}
    >
      {!reading && (
        <>
          <Link className="song-back" to={setlistItem && service ? `/cultos/${service.id}` : '/musicas'}>
            <ArrowLeft size={16} />
            {setlistItem && service ? 'Voltar ao culto' : 'Voltar à biblioteca'}
          </Link>
          {position && service && (
            <nav className="song-setlist-nav" aria-label="Músicas deste culto">
              {position.previous ? (
                <Link
                  className="song-setlist-step"
                  to={setlistSongPath(service.id, position.previous)}
                  aria-label={`Anterior: ${stepTitle(position.previous)}`}
                >
                  <ChevronLeft size={18} />
                  <span>
                    <small>Anterior</small>
                    <strong>{stepTitle(position.previous)}</strong>
                  </span>
                </Link>
              ) : (
                <span className="song-setlist-step song-setlist-edge">Primeira música</span>
              )}
              <span className="song-setlist-count" aria-hidden="true">
                <strong>{position.index + 1}</strong> de {position.total}
              </span>
              {position.next ? (
                <Link
                  className="song-setlist-step song-setlist-next"
                  to={setlistSongPath(service.id, position.next)}
                  aria-label={`Próxima: ${stepTitle(position.next)}`}
                >
                  <span>
                    <small>Próxima</small>
                    <strong>{stepTitle(position.next)}</strong>
                  </span>
                  <ChevronRight size={18} />
                </Link>
              ) : (
                <span className="song-setlist-step song-setlist-edge">Última música</span>
              )}
            </nav>
          )}
          <header className="song-header">
            <div className="song-heading">
              <span className="song-title-icon">
                <Music2 size={27} />
              </span>
              <div>
                <p className="eyebrow">{setlistItem && service ? `${service.type} · ${serviceLabel}` : 'BIBLIOTECA DE MÚSICAS'}</p>
                <h1>{song.title}</h1>
                <p className="song-artist">{song.artist}</p>
              </div>
            </div>
            {canEditLibrary && (
              <button className="button button-secondary" onClick={() => setEditing(true)}>
                <Pencil size={16} />
                Editar música
              </button>
            )}
          </header>
          <div className="song-meta">
            <span>
              Tom na igreja <strong>{song.churchKey}</strong>
            </span>
            {setlistItem && (
              <span>
                Tom do culto <strong>{setlistItem.key}</strong>
              </span>
            )}
            {songTags.map(tag => (
              <span key={tag.id} className="songs-tag">
                <span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
          </div>
        </>
      )}
      <section className="card song-reader">
        {!reading && (
          <div className="song-source-link">
            <span>Consulte a referência no Cifra Club</span>
            <a className="button button-secondary" href={cifraClubUrl} target="_blank" rel="noopener noreferrer">
              Abrir Cifra Club
              <ExternalLink size={15} />
            </a>
          </div>
        )}
        <div className="song-reader-toolbar">
          <div className="song-content-tabs" role="group" aria-label="Tipo de visualização">
            <button className={showChords ? 'active' : ''} aria-pressed={showChords} onClick={() => setShowChords(true)}>
              <Music2 size={16} />
              <span>Letra e cifra</span>
            </button>
            <button className={!showChords ? 'active' : ''} aria-pressed={!showChords} onClick={() => setShowChords(false)}>
              <FileText size={16} />
              <span>Somente letra</span>
            </button>
          </div>
          <div className="song-reader-controls">
            <div className="song-key-control">
              <button className="icon-button" aria-label="Diminuir um semitom" onClick={() => stepKey(-1)}>
                <Minus size={15} />
              </button>
              <label>
                <span className="sr-only">Tom da visualização</span>
                <select value={viewKey} onChange={e => changeKey(e.target.value)} aria-label="Tom da visualização">
                  {KEYS.map(key => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
              </label>
              <button className="icon-button" aria-label="Aumentar um semitom" onClick={() => stepKey(1)}>
                <Plus size={15} />
              </button>
            </div>
            <div className="song-font-control">
              <button
                className="icon-button"
                aria-label="Diminuir tamanho da letra"
                disabled={fontSize <= 14}
                onClick={() => setFontSize(size => Math.max(14, size - 2))}
              >
                <span className="song-small-a">A</span>
              </button>
              <button
                className="icon-button"
                aria-label="Aumentar tamanho da letra"
                disabled={fontSize >= 28}
                onClick={() => setFontSize(size => Math.min(28, size + 2))}
              >
                <span className="song-large-a">A</span>
              </button>
            </div>
            <button
              className={`icon-button song-reading-button ${reading ? 'active' : ''}`}
              aria-label={reading ? 'Sair do modo leitura' : 'Entrar no modo leitura'}
              title={reading ? 'Sair do modo leitura' : 'Modo leitura'}
              aria-pressed={reading}
              onClick={() => setReading(value => !value)}
            >
              {reading ? <X size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
        <div className="song-reader-context">
          <span>{reading ? song.title : 'Prepare o coração. Acompanhe a canção.'}</span>
          <span>
            Tom <strong>{viewKey}</strong>
            {viewKey !== defaultKey && <span className="song-temporary"> · visualização</span>}
          </span>
        </div>
        <div className={`song-sheet ${showChords ? 'song-sheet-chords' : ''}`} style={{ fontSize: `${fontSize}px` }}>
          {showChords ? (
            content.split('\n').map((line, lineIndex) => {
              const section = sectionLabel(line);
              const rest = section ? section.rest : line;
              const chords = rest.length
                ? chordSegments(rest)
                    .filter(segment => segment.chord || segment.text)
                    .map((segment, index) => (
                      <span
                        className={`song-segment${segment.chord && !segment.text.trim() ? ' song-segment-instrumental' : ''}`}
                        key={index}
                      >
                        <span className="song-chord">{segment.chord || '\u00a0'}</span>
                        <span className="song-lyric">{segment.text}</span>
                      </span>
                    ))
                : null;
              if (section)
                return (
                  <div className="song-line song-section-line" key={lineIndex}>
                    <span className="song-section-label">{section.label}</span>
                    {chords}
                  </div>
                );
              return (
                <div className="song-line" key={lineIndex}>
                  {chords ?? <span className="song-blank-line">&nbsp;</span>}
                </div>
              );
            })
          ) : (
            <div className="song-lyrics-only">
              {stripChords(content)
                .split('\n')
                .map((line, lineIndex) => {
                  const section = sectionLabel(line);
                  return section ? (
                    <span className="song-section-line" key={lineIndex}>
                      <span className="song-section-label">{section.label}</span>
                      {section.rest && ` ${section.rest}`}
                      {'\n'}
                    </span>
                  ) : (
                    <span key={lineIndex}>
                      {line}
                      {'\n'}
                    </span>
                  );
                })}
            </div>
          )}
        </div>
        {(reading || position) && (
          <nav className={`song-stage-bar ${reading ? 'song-stage-floating' : ''}`} aria-label="Controles de palco">
            {position && service ? (
              position.previous ? (
                <Link
                  className="button button-secondary song-stage-step"
                  to={setlistSongPath(service.id, position.previous)}
                  state={{ reading }}
                  aria-label="Música anterior do repertório"
                >
                  <ChevronLeft size={18} />
                  <span>Anterior</span>
                </Link>
              ) : (
                <span className="song-stage-step song-stage-placeholder" aria-hidden="true" />
              )
            ) : null}
            {reading ? (
              <div className="song-stage-scroll" role="group" aria-label="Rolagem automática">
                <button
                  type="button"
                  className={`button ${scrolling ? 'button-primary' : 'button-secondary'}`}
                  aria-pressed={scrolling}
                  onClick={() => setScrolling(value => !value)}
                >
                  {scrolling ? <Pause size={17} /> : <Play size={17} />}
                  <span>{scrolling ? 'Pausar' : 'Rolar'}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Rolagem mais lenta"
                  disabled={speed <= 1}
                  onClick={() => setSpeed(value => Math.max(1, value - 1))}
                >
                  <Minus size={15} />
                </button>
                <span className="song-stage-speed" aria-live="polite">
                  Velocidade {speed}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Rolagem mais rápida"
                  disabled={speed >= 8}
                  onClick={() => setSpeed(value => Math.min(8, value + 1))}
                >
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              position && (
                <span className="song-stage-count">
                  Música {position.index + 1} de {position.total}
                </span>
              )
            )}
            {position && service ? (
              position.next ? (
                <Link
                  className="button button-primary song-stage-step"
                  to={setlistSongPath(service.id, position.next)}
                  state={{ reading }}
                  aria-label="Próxima música do repertório"
                >
                  <span>Próxima</span>
                  <ChevronRight size={18} />
                </Link>
              ) : (
                <span className="song-stage-step song-stage-placeholder" aria-hidden="true" />
              )
            ) : null}
          </nav>
        )}
        {!reading && (
          <div className="song-reader-footer">
            <span>
              <Check size={14} />A troca de tom altera apenas sua visualização.
            </span>
            <button className="button button-ghost" disabled={viewKey === defaultKey} onClick={() => changeKey(defaultKey)}>
              Restaurar tom {defaultKey}
            </button>
          </div>
        )}
      </section>
      {!reading && (
        <>
          {setlistItem && service && canPlan && (
            <div className="song-save-key card">
              <div>
                <h3>Tom para este culto</h3>
                <p>
                  Salve {viewKey} no repertório de {serviceLabel}. Os demais cultos continuam com seus próprios tons.
                </p>
                <FormError error={saveError} />
                {saved && (
                  <p className="song-save-success" role="status">
                    <Check size={15} />
                    Tom salvo no repertório.
                  </p>
                )}
              </div>
              <button className="button button-primary" disabled={saving || busy || viewKey === setlistItem.key} onClick={saveKey}>
                <Save size={16} />
                {saving ? 'Salvando…' : 'Salvar tom no culto'}
              </button>
            </div>
          )}
          <div className="song-detail-grid">
            <section className="card song-note-card">
              <h2>
                <StickyNote size={18} />
                Observações da música
              </h2>
              <p className={!song.notes ? 'muted' : ''}>{song.notes || 'Nenhuma observação cadastrada para esta música.'}</p>
            </section>
            {setlistItem && (
              <section className="card song-note-card">
                <h2>
                  <StickyNote size={18} />
                  Observações deste culto
                </h2>
                <p className={!setlistItem.notes ? 'muted' : ''}>{setlistItem.notes || 'Nenhuma orientação específica no repertório.'}</p>
              </section>
            )}
            {referenceVideoUrl && (
              <section className="card song-video-reference">
                <h2>
                  <Music2 size={18} />
                  Ouça a referência
                </h2>
                <YoutubeVideoCard
                  url={referenceVideoUrl}
                  title={song.title}
                  caption={serviceVideoUrl ? 'Versão deste culto' : 'Vídeo da biblioteca'}
                />
              </section>
            )}
          </div>
        </>
      )}
      {editing && <SongEditor song={song} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** True when the touch starts on something that scrolls sideways (a long chord line), so the swipe stays a scroll. */
function scrollsSideways(target: EventTarget | null, root: HTMLElement): boolean {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== root.parentElement;
    element = element.parentElement
  ) {
    if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth + 2) continue;
    const overflow = getComputedStyle(element).overflowX;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
}
