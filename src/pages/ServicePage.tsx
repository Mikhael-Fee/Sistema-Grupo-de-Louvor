import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  FileText,
  GripVertical,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { EmptyState, FormError, Modal } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import YoutubeVideoCard from '../components/YoutubeVideoCard';
import YoutubeVersionPicker from '../components/YoutubeVersionPicker';
import { useMinistry } from '../context/MinistryContext';
import { useDraft } from '../hooks/useDraft';
import { KEYS } from '../lib/music';
import { getPersonPhoto } from '../lib/avatars';
import { normalizeYouTubeUrl } from '../lib/youtube';
import { validateService } from '../lib/validation';
import { buildServiceShareText, whatsappShareUrl } from '../lib/service-share';
import PresenceButtons, { StatusBadge } from '../components/PresenceButtons';
import { presenceSummary, unavailableOn } from '../lib/presence';
import { singerKeys } from '../lib/member-profile';
import '../components/member-profile.css';
import type { Assignment, Person, Service, SetlistItem, Song } from '../types';
import {
  formatServiceDate,
  mergeTeamAssignments,
  previousTeamService,
  RepertoirePicker,
  restoreTeamPickerDraft,
  selectedRepertoireItems,
  selectedTeamAssignments,
  ServiceForm,
  TeamPicker,
  teamPickerFromAssignments,
  type RepertoirePickerDraft,
  type TeamPickerDraft,
} from './ServicesPage';
import './services.css';
import './service-page.css';

type Dialog = 'edit' | 'team' | 'song' | 'delete' | null;

function BulkTeamForm({
  service,
  services,
  people,
  busy,
  error,
  onSave,
  onCancel,
}: {
  service: Service;
  services: Service[];
  people: Person[];
  busy: boolean;
  error: string | null;
  onSave: (assignments: Assignment[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const currentTeam = teamPickerFromAssignments(service.assignments);
  const {
    draft: storedDraft,
    setDraft,
    discardDraft,
  } = useDraft<TeamPickerDraft>(`service:${service.id}:team`, { selection: currentTeam.selection, search: '' });
  const draft = restoreTeamPickerDraft(storedDraft, service, people);
  const assignments = selectedTeamAssignments(draft.selection, service, people, draft.additional, true);
  const previousService = previousTeamService(service, services);
  async function apply(next: Assignment[]) {
    if (busy) return;
    if (await onSave(next)) discardDraft();
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void apply(assignments);
      }}
    >
      {previousService && (
        <div className="service-batch-copy">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            title={`${previousService.type} · ${formatServiceDate(previousService.date)}`}
            onClick={() => setDraft(teamPickerFromAssignments(mergeTeamAssignments(assignments, previousService.assignments, people)))}
          >
            <Copy size={15} /> Reutilizar última escala
          </button>
        </div>
      )}
      {people.length ? (
        <TeamPicker service={service} people={people} value={draft} onChange={setDraft} editExisting disabled={busy} />
      ) : (
        <EmptyState
          title="Cadastre a equipe primeiro"
          description="Pessoas e suas funções precisam estar cadastradas antes de montar a escala."
          action={
            <Link className="button button-primary" to="/pessoas">
              Ir para equipe
            </Link>
          }
        />
      )}
      <FormError error={error} />
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            discardDraft();
            onCancel();
          }}
        >
          Cancelar
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar equipe'}
        </button>
      </div>
    </form>
  );
}

function RepertoireItemForm({
  serviceId,
  initial,
  song,
  busy,
  error,
  onSave,
  onCancel,
}: {
  serviceId: string;
  initial: SetlistItem;
  song?: Song;
  busy: boolean;
  error: string | null;
  onSave: (item: SetlistItem) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<SetlistItem>(`service:${serviceId}:item:${initial.id}`, initial);
  const { data } = useMinistry();
  const service = data.services.find(item => item.id === serviceId);
  const singers = service ? singerKeys(data, service, initial.songId) : [];
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoUrl = (draft.youtubeUrl || '').trim();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const youtubeUrl = videoUrl ? normalizeYouTubeUrl(videoUrl) : '';
    if (youtubeUrl === null) {
      setVideoError('Informe um link válido de vídeo do YouTube ou deixe o campo vazio.');
      return;
    }
    setVideoError(null);
    if (await onSave({ ...draft, id: initial.id, songId: initial.songId, notes: draft.notes.trim(), youtubeUrl })) discardDraft();
  }
  return (
    <form className="repertoire-video-form" onSubmit={submit}>
      <p className="muted">Estes ajustes valem apenas para este culto.</p>
      {hasDraft && (
        <p className="service-draft-status" role="status">
          Rascunho guardado nesta aba.
        </p>
      )}
      <div className="form-grid">
        <label className="field service-form-full">
          <span>Tom neste culto</span>
          <select value={draft.key} disabled={busy} onChange={event => setDraft({ ...draft, key: event.target.value })}>
            {KEYS.map(key => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        {singers.length > 0 && (
          <div className="singer-keys service-form-full" aria-label="Tons de quem canta neste culto">
            {singers.map(item => (
              <p key={item.person.id}>
                <span>
                  <strong>{item.person.name}</strong> (voz neste culto) canta em <strong>{item.key}</strong>.
                </span>
                {draft.key === item.key ? (
                  <span className="muted">Já está neste tom</span>
                ) : (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setDraft({ ...draft, key: item.key })}
                  >
                    Usar {item.key}
                  </button>
                )}
              </p>
            ))}
          </div>
        )}
        <label className="field service-form-full">
          <span>
            Observação <span className="muted">(opcional)</span>
          </span>
          <textarea
            rows={4}
            placeholder="Introdução, repetições, dinâmica…"
            value={draft.notes}
            disabled={busy}
            onChange={event => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>
      </div>
      <YoutubeVersionPicker
        value={draft.youtubeUrl || ''}
        onChange={url => {
          setVideoError(null);
          setDraft({ ...draft, youtubeUrl: url });
        }}
        songTitle={song?.title || ''}
        songArtist={song?.artist || ''}
        libraryUrl={song?.youtubeUrl || ''}
        disabled={busy}
      />
      <FormError error={videoError || error} />
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            discardDraft();
            onCancel();
          }}
        >
          Cancelar
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar ajustes'}
        </button>
      </div>
    </form>
  );
}

function BulkRepertoireForm({
  service,
  songs,
  busy,
  error,
  onSave,
  onCancel,
}: {
  service: Service;
  songs: Song[];
  busy: boolean;
  error: string | null;
  onSave: (items: SetlistItem[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { draft, setDraft, discardDraft, hasDraft } = useDraft<RepertoirePickerDraft>(`service:${service.id}:repertoire`, {
    selection: [],
    search: '',
  });
  const remainingSongs = songs.filter(song => !service.repertoire.some(item => item.songId === song.id));
  const selected = [...new Set(draft.selection)].filter(id => remainingSongs.some(song => song.id === id));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const additions = selectedRepertoireItems(selected, service, songs);
    if (!additions.length) return;
    if (await onSave(additions)) discardDraft();
  }
  if (!remainingSongs.length)
    return (
      <EmptyState
        title={songs.length ? 'Todas as músicas já foram adicionadas' : 'Sua biblioteca ainda está vazia'}
        description={
          songs.length ? 'Uma música aparece apenas uma vez neste repertório.' : 'Cadastre uma música para começar o repertório.'
        }
        action={
          <Link className="button button-secondary" to="/musicas">
            Ver biblioteca
          </Link>
        }
      />
    );
  return (
    <form onSubmit={submit}>
      <p className="muted">Marque todas as músicas que vão participar. Elas serão adicionadas de uma vez, com o tom usado na igreja.</p>
      {hasDraft && <p className="service-draft-status">Sua seleção está guardada nesta aba.</p>}
      <RepertoirePicker service={service} songs={songs} value={draft} onChange={setDraft} disabled={busy} />
      <FormError error={error} />
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            discardDraft();
            onCancel();
          }}
        >
          Cancelar
        </button>
        <button className="button button-primary" disabled={busy || !selected.length}>
          {busy ? 'Salvando…' : `Adicionar selecionadas (${selected.length})`}
        </button>
      </div>
    </form>
  );
}

const TABS = [
  { id: 'repertorio', label: 'Repertório', icon: Music2 },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'detalhes', label: 'Detalhes', icon: FileText },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Overlapping photos of the people scheduled, at most five plus a "+N". */
function AvatarStack({ people }: { people: (Person | undefined)[] }) {
  const unique = people.filter((person, index, all): person is Person => Boolean(person) && all.indexOf(person) === index);
  if (!unique.length) return null;
  const shown = unique.slice(0, 5);
  return (
    <span className="culto-avatars" aria-hidden="true">
      {shown.map(person => (
        <ProfileAvatar key={person.id} name={person.name} photoUrl={getPersonPhoto(person)} size={30} className="culto-avatar" decorative />
      ))}
      {unique.length > shown.length && <span className="culto-avatar culto-avatar-more">+{unique.length - shown.length}</span>}
    </span>
  );
}

/** "⋯" menu with the actions nobody needs on a Sunday: copy text, edit and delete. */
function MoreMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="culto-more" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="icon-button culto-more-button"
        aria-label="Mais opções do culto"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div className="culto-menu" id={menuId} role="menu" aria-label="Opções do culto">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export default function ServicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, canPlan, busy, error, saveService, deleteService, presenceEnabled, profile } = useMinistry();
  const service = data.services.find(item => item.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [editingItem, setEditingItem] = useState<SetlistItem | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const disabled = busy || saving;
  const requested = params.get('aba');
  const tab: TabId = TABS.some(item => item.id === requested) ? (requested as TabId) : 'repertorio';

  if (!service)
    return (
      <>
        <Link to="/cultos" className="service-back">
          <ArrowLeft size={17} /> Voltar aos cultos
        </Link>
        <EmptyState
          title="Culto não encontrado"
          description="Este culto pode ter sido removido. Consulte a lista de cultos."
          action={
            <Link to="/cultos" className="button button-primary">
              Ver cultos
            </Link>
          }
        />
      </>
    );

  const currentService = service;
  // Kept in the address so a refresh of the shared data (which remounts the page) keeps the mode.
  const editing = canPlan && params.get('editar') === 'repertorio';
  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  const shareText = buildServiceShareText(service, data, `${window.location.origin}/cultos/${service.id}`);
  const isUnavailable = (personId: string) => Boolean(unavailableOn(data, personId, service.date));
  const summary = presenceEnabled ? presenceSummary(service.assignments, isUnavailable) : null;
  const myAssignments = presenceEnabled ? service.assignments.filter(item => item.personId === profile?.personId) : [];
  const firstItem = service.repertoire[0];
  const scheduledPeople = service.assignments.map(assignment => data.people.find(person => person.id === assignment.personId));
  const peopleCount = new Set(service.assignments.map(item => item.personId)).size;
  // The system share sheet hands the exact text (with line breaks) to the WhatsApp app.
  // Browsers without it open the wa.me link instead.
  function shareNatively(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator.share !== 'function') return;
    event.preventDefault();
    navigator.share({ text: shareText }).catch(cause => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      window.open(whatsappShareUrl(shareText), '_blank', 'noopener,noreferrer');
    });
  }
  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionError('Não foi possível copiar. Use o botão do WhatsApp.');
    }
  }
  async function save(next: Service, close = false) {
    if (lock.current || busy) return false;
    const validationError = validateService(next, data);
    if (validationError) {
      setActionError(validationError);
      return false;
    }
    lock.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await saveService(next);
      if (close) {
        setDialog(null);
        setEditingItem(null);
      }
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Não foi possível salvar a alteração. Tente novamente.');
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function open(next: Dialog) {
    setActionError(null);
    setDialog(next);
  }
  function close() {
    if (disabled) return;
    setDialog(null);
    setEditingItem(null);
    setActionError(null);
  }
  async function reorder(itemId: string, targetIndex: number) {
    const index = currentService.repertoire.findIndex(item => item.id === itemId);
    if (index < 0 || targetIndex < 0 || targetIndex >= currentService.repertoire.length || index === targetIndex || disabled) return;
    const repertoire = [...currentService.repertoire];
    const [moved] = repertoire.splice(index, 1);
    repertoire.splice(targetIndex, 0, moved);
    await save({ ...currentService, repertoire });
  }
  async function removeService() {
    if (lock.current || busy) return;
    lock.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await deleteService(currentService.id);
      navigate('/cultos');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Não foi possível excluir o culto.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const teamGroups: { id: string; label: string; items: Assignment[] }[] = summary
    ? [
        {
          id: 'confirmed',
          label: 'Confirmados',
          items: service.assignments.filter(item => item.status === 'confirmed'),
        },
        {
          id: 'pending',
          label: 'Aguardando resposta',
          items: service.assignments.filter(item => (item.status ?? 'pending') === 'pending' && !isUnavailable(item.personId)),
        },
        {
          id: 'declined',
          label: 'Não poderão',
          items: service.assignments.filter(
            item => item.status === 'declined' || ((item.status ?? 'pending') === 'pending' && isUnavailable(item.personId)),
          ),
        },
      ].filter(group => group.items.length)
    : [{ id: 'all', label: '', items: service.assignments }];
  const dateLong = formatServiceDate(service.date, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="culto-page">
      <Link to="/cultos" className="service-back">
        <ArrowLeft size={17} /> Voltar aos cultos
      </Link>
      <section className="culto-hero" aria-label="Resumo do culto">
        <div className="member-hero-cover" aria-hidden="true" />
        <div className="culto-hero-body">
          <div className="culto-hero-date" aria-hidden="true">
            <strong>{service.date.slice(8, 10)}</strong>
            <span>{formatServiceDate(service.date, { month: 'short' }).replace('.', '')}</span>
          </div>
          <div className="culto-hero-text">
            <h1>{service.type}</h1>
            <p>
              <span className="culto-hero-when">{dateLong}</span>
              <span aria-hidden="true"> · </span>
              <span>
                <Clock3 size={13} aria-hidden="true" /> {service.time}
              </span>
            </p>
          </div>
          <div className="culto-hero-summary">
            <AvatarStack people={scheduledPeople} />
            <span className="culto-hero-counts">
              {service.repertoire.length} {service.repertoire.length === 1 ? 'música' : 'músicas'} · {peopleCount}{' '}
              {peopleCount === 1 ? 'pessoa' : 'pessoas'}
            </span>
            {summary && service.assignments.length > 0 && (
              <span className="culto-presence-pill">
                <Check size={13} aria-hidden="true" /> {summary.confirmed} de {service.assignments.length} confirmados
              </span>
            )}
            {service.isEvent && (
              <span className="service-event-indicator">
                <Sparkles size={13} /> Evento
              </span>
            )}
          </div>
          <div className="culto-hero-actions">
            {firstItem ? (
              <Link
                className="button button-primary culto-open"
                to={`/musicas/${firstItem.songId}?service=${service.id}&item=${firstItem.id}`}
              >
                <PlayCircle size={17} /> Abrir repertório
              </Link>
            ) : (
              <span className="culto-open-empty muted">O repertório ainda não foi montado.</span>
            )}
            <a
              className="icon-button culto-whatsapp"
              href={whatsappShareUrl(shareText)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Enviar escala e repertório no WhatsApp"
              title="Enviar no WhatsApp"
              onClick={shareNatively}
            >
              <MessageCircle size={19} />
            </a>
            <MoreMenu>
              {closeMenu => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      void copyShareText();
                    }}
                  >
                    <Copy size={16} /> Copiar texto da escala
                  </button>
                  {canPlan && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() => {
                          closeMenu();
                          open('edit');
                        }}
                      >
                        <Pencil size={16} /> Editar culto
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="culto-menu-danger"
                        disabled={disabled}
                        onClick={() => {
                          closeMenu();
                          open('delete');
                        }}
                      >
                        <Trash2 size={16} /> Excluir culto
                      </button>
                    </>
                  )}
                </>
              )}
            </MoreMenu>
          </div>
          <p className="culto-hero-notice" role="status">
            {copied && (
              <>
                <Check size={14} aria-hidden="true" /> Texto copiado. É só colar no grupo.
              </>
            )}
          </p>
        </div>
      </section>
      <FormError error={actionError && !dialog && !editingItem ? actionError : null} />
      <FormError error={error} />
      {myAssignments.length > 0 && (
        <section className="card culto-presence-card" aria-label="Sua escala neste culto">
          <p>
            Você está na escala como <strong>{[...new Set(myAssignments.map(item => item.function))].join(' e ')}</strong>.{' '}
            {(myAssignments[0].status ?? 'pending') === 'pending' ? 'Vai poder?' : ''}
          </p>
          <PresenceButtons assignments={myAssignments} />
        </section>
      )}
      <div className="member-tabs culto-tabs" role="tablist" aria-label="Seções do culto">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            id={`culto-tab-${tabId}`}
            aria-selected={tab === tabId}
            aria-controls={`culto-panel-${tabId}`}
            className={tab === tabId ? 'member-tab member-tab-active' : 'member-tab'}
            onClick={() => updateParams({ aba: tabId === 'repertorio' ? null : tabId })}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
            {tabId === 'repertorio' && <span className="culto-tab-count">{service.repertoire.length}</span>}
            {tabId === 'equipe' && <span className="culto-tab-count">{service.assignments.length}</span>}
          </button>
        ))}
      </div>
      <div className="culto-panels">
        <div className="culto-main">
          <section
            id="culto-panel-repertorio"
            role="tabpanel"
            aria-labelledby="culto-tab-repertorio"
            className={`card culto-panel service-repertoire ${tab === 'repertorio' ? 'culto-panel-active' : ''} ${editing ? 'culto-editing' : ''}`}
          >
            <div className="culto-panel-heading">
              <h2>
                Repertório <span>{service.repertoire.length}</span>
              </h2>
              {canPlan && (service.repertoire.length > 0 || editing) && (
                <button
                  type="button"
                  className={`button ${editing ? 'button-primary' : 'button-secondary'} culto-edit-toggle`}
                  aria-pressed={editing}
                  onClick={() => updateParams({ editar: editing ? null : 'repertorio' })}
                >
                  {editing ? <Check size={15} /> : <Pencil size={15} />} {editing ? 'Concluir' : 'Editar repertório'}
                </button>
              )}
            </div>
            {editing && (
              <div className="culto-edit-bar">
                <p>Arraste ou use as setas para mudar a ordem. O lápis ajusta tom, observação e vídeo só deste culto.</p>
                <button className="button button-secondary" onClick={() => open('song')} disabled={disabled}>
                  <Plus size={16} /> <span>Selecionar músicas</span>
                </button>
              </div>
            )}
            {service.repertoire.length ? (
              <ol className="service-setlist culto-setlist">
                {service.repertoire.map((item, index) => {
                  const song = data.songs.find(candidate => candidate.id === item.songId);
                  const serviceVideo = normalizeYouTubeUrl(item.youtubeUrl || '');
                  return (
                    <li
                      key={item.id}
                      className={`service-setlist-item culto-song ${dragging === item.id ? 'service-dragging' : ''} ${dropTarget === item.id ? 'service-drop-target' : ''}`}
                      draggable={editing && !disabled}
                      onDragStart={event => {
                        if (!editing || disabled) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.setData('text/plain', item.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging(item.id);
                      }}
                      onDragOver={event => {
                        if (!editing || disabled || !dragging || dragging === item.id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDropTarget(item.id);
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={event => {
                        event.preventDefault();
                        const draggedId = event.dataTransfer.getData('text/plain');
                        setDropTarget(null);
                        setDragging(null);
                        if (editing && draggedId && currentService.repertoire.some(candidate => candidate.id === draggedId))
                          void reorder(draggedId, index);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                    >
                      <span className="culto-song-number">
                        {editing && <GripVertical size={15} className="service-drag-handle" aria-hidden="true" />}
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="culto-song-main">
                        <Link to={`/musicas/${item.songId}?service=${service.id}&item=${item.id}`} className="service-item-title">
                          {song?.title || 'Música indisponível'}
                        </Link>
                        <p className="service-item-artist">{song?.artist || 'Consulte a biblioteca'}</p>
                        {item.notes && <p className="service-item-note">{item.notes}</p>}
                      </div>
                      <span className="service-key">
                        <span className="sr-only">Tom </span>
                        {item.key}
                      </span>
                      <YoutubeVideoCard
                        compact
                        url={serviceVideo || song?.youtubeUrl || ''}
                        title={song?.title || 'Música do repertório'}
                        caption={serviceVideo ? 'Versão deste culto' : 'Vídeo da biblioteca'}
                      />
                      {editing && (
                        <div className="culto-song-edit">
                          <div className="service-item-actions">
                            <button
                              className="icon-button"
                              disabled={disabled || index === 0}
                              aria-label={`Mover ${song?.title || 'música'} para cima`}
                              onClick={() => void reorder(item.id, index - 1)}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={disabled || index === service.repertoire.length - 1}
                              aria-label={`Mover ${song?.title || 'música'} para baixo`}
                              onClick={() => void reorder(item.id, index + 1)}
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={disabled}
                              aria-label={`Editar tom e observação de ${song?.title || 'música'}`}
                              title="Editar tom, observação e vídeo deste culto"
                              onClick={() => {
                                setActionError(null);
                                setEditingItem({ ...item });
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={disabled}
                              aria-label={`Remover ${song?.title || 'música'} do repertório`}
                              onClick={() =>
                                void save({
                                  ...currentService,
                                  repertoire: currentService.repertoire.filter(candidate => candidate.id !== item.id),
                                })
                              }
                            >
                              <X size={17} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="text-button service-item-version"
                            disabled={disabled}
                            onClick={() => {
                              setActionError(null);
                              setEditingItem({ ...item });
                            }}
                          >
                            <Search size={13} />
                            {serviceVideo
                              ? 'Trocar a versão deste culto'
                              : normalizeYouTubeUrl(song?.youtubeUrl)
                                ? 'Escolher outra versão para este culto'
                                : 'Escolher um vídeo para este culto'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState
                title="O repertório está em branco"
                description={
                  canPlan
                    ? 'Selecione todas as músicas que vão conduzir este encontro.'
                    : 'As músicas aparecerão aqui quando o repertório estiver pronto.'
                }
                action={
                  canPlan &&
                  !editing && (
                    <button className="button button-primary" onClick={() => open('song')} disabled={disabled}>
                      <Plus size={16} /> Selecionar músicas
                    </button>
                  )
                }
              />
            )}
          </section>
          <section
            id="culto-panel-detalhes"
            role="tabpanel"
            aria-labelledby="culto-tab-detalhes"
            className={`card culto-panel culto-details ${tab === 'detalhes' ? 'culto-panel-active' : ''} ${service.notes ? '' : 'culto-details-empty'}`}
          >
            <div className="culto-panel-heading">
              <h2>Detalhes</h2>
            </div>
            <dl className="culto-facts">
              <div>
                <dt>
                  <CalendarDays size={15} aria-hidden="true" /> Data
                </dt>
                <dd>{formatServiceDate(service.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={15} aria-hidden="true" /> Horário
                </dt>
                <dd>{service.time}</dd>
              </div>
              <div>
                <dt>
                  <Sparkles size={15} aria-hidden="true" /> Tipo
                </dt>
                <dd>{service.isEvent ? `${service.type} (evento)` : service.type}</dd>
              </div>
            </dl>
            <div className="service-observations">
              <h3>Observações do culto</h3>
              {service.notes ? <p>{service.notes}</p> : <p className="muted">Nenhuma observação para este culto.</p>}
            </div>
          </section>
        </div>
        <div className="culto-side">
          <section
            id="culto-panel-equipe"
            role="tabpanel"
            aria-labelledby="culto-tab-equipe"
            className={`card culto-panel service-team ${tab === 'equipe' ? 'culto-panel-active' : ''}`}
          >
            <div className="culto-panel-heading">
              <h2>
                Equipe <span>{service.assignments.length}</span>
              </h2>
              {canPlan && (
                <button className="button button-secondary culto-edit-toggle" onClick={() => open('team')} disabled={disabled}>
                  <Pencil size={15} /> {service.assignments.length ? 'Editar equipe' : 'Selecionar equipe'}
                </button>
              )}
            </div>
            {service.assignments.length ? (
              <>
                {summary && (
                  <p className="service-section-description">
                    {`${summary.confirmed} confirmados · ${summary.declined} não poderão · ${summary.pending} aguardando`}
                  </p>
                )}
                {teamGroups.map(group => (
                  <div key={group.id} className={`culto-team-group culto-team-${group.id}`}>
                    {group.label && <h3>{group.label}</h3>}
                    <ul className="service-team-list">
                      {group.items.map(assignment => {
                        const person = data.people.find(candidate => candidate.id === assignment.personId);
                        return (
                          <li key={assignment.id}>
                            <ProfileAvatar
                              name={person?.name || 'Pessoa indisponível'}
                              photoUrl={getPersonPhoto(person)}
                              size={36}
                              className="service-avatar"
                              decorative
                            />
                            <div>
                              <strong>{person?.name || 'Pessoa indisponível'}</strong>
                              <span>{assignment.function}</span>
                            </div>
                            {presenceEnabled && (
                              <StatusBadge
                                assignment={assignment}
                                unavailableNote={unavailableOn(data, assignment.personId, service.date)?.note}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </>
            ) : (
              <EmptyState
                title="Vamos reunir a equipe"
                description={
                  canPlan ? 'Selecione todas as pessoas e suas funções para este culto.' : 'A escala aparecerá aqui quando estiver pronta.'
                }
              />
            )}
          </section>
        </div>
      </div>
      {dialog === 'edit' && (
        <Modal wide title="Editar culto" onClose={close}>
          <ServiceForm
            initial={service}
            busy={disabled}
            onCancel={close}
            onSave={async next => {
              await saveService(next);
              setDialog(null);
            }}
          />
        </Modal>
      )}
      {dialog === 'song' && (
        <Modal wide title="Selecionar músicas para o repertório" onClose={close}>
          <BulkRepertoireForm
            service={service}
            songs={data.songs}
            busy={disabled}
            error={actionError}
            onCancel={close}
            onSave={items => save({ ...currentService, repertoire: [...currentService.repertoire, ...items] }, true)}
          />
        </Modal>
      )}
      {editingItem && (
        <Modal title="Ajustes da música neste culto" onClose={close}>
          <RepertoireItemForm
            serviceId={service.id}
            initial={editingItem}
            song={data.songs.find(song => song.id === editingItem.songId)}
            busy={disabled}
            error={actionError}
            onCancel={close}
            onSave={edited =>
              save({ ...currentService, repertoire: currentService.repertoire.map(item => (item.id === edited.id ? edited : item)) }, true)
            }
          />
        </Modal>
      )}
      {dialog === 'team' && (
        <Modal wide title={service.assignments.length ? 'Editar equipe' : 'Selecionar equipe'} onClose={close}>
          <BulkTeamForm
            service={service}
            services={data.services}
            people={data.people}
            busy={disabled}
            error={actionError}
            onCancel={close}
            onSave={assignments => save({ ...currentService, assignments }, true)}
          />
        </Modal>
      )}
      {dialog === 'delete' && (
        <Modal title="Excluir este culto?" onClose={close}>
          <p>
            A escala e o repertório de <strong>{service.type}</strong>, em {formatServiceDate(service.date)}, serão removidos. As músicas e
            as pessoas continuam cadastradas.
          </p>
          <FormError error={actionError} />
          <div className="form-actions">
            <button className="button button-secondary" disabled={disabled} onClick={close}>
              Cancelar
            </button>
            <button className="button button-primary service-delete-confirm" disabled={disabled} onClick={() => void removeService()}>
              {saving ? 'Excluindo…' : 'Excluir culto'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
