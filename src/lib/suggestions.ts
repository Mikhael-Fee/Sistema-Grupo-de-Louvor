import { normalizeSearch } from './music';
import type { Song, SongSuggestion, SuggestionStatus } from '../types';

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: 'Sugerida',
  reviewing: 'Em avaliação',
  approved: 'Aprovada',
  declined: 'Recusada',
};

/** Text the database puts in a song created from a suggestion, until someone adds the chords. */
export const PENDING_CHORDS_CONTENT = 'Cifra pendente. Edite esta música para adicionar a letra e os acordes.';
export const isPendingChords = (song: Pick<Song, 'content'>) => song.content.trim() === PENDING_CHORDS_CONTENT;

/** How long things stay in the main lists before going to "Arquivo". */
export const OPEN_DAYS = 60;
export const DECIDED_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export type SuggestionView = 'open' | 'decided' | 'archive';

/**
 * Open suggestions stay while people interact with them (likes, comments) and leave after
 * 60 quiet days. Approved and declined ones show under "Decididas" for 14 days, then go to the archive.
 */
export function suggestionView(
  item: Pick<SongSuggestion, 'status' | 'statusChangedAt' | 'lastActivityAt'>,
  now = Date.now(),
): SuggestionView {
  if (item.status === 'approved' || item.status === 'declined')
    return now - Date.parse(item.statusChangedAt) <= DECIDED_DAYS * DAY ? 'decided' : 'archive';
  return now - Date.parse(item.lastActivityAt) <= OPEN_DAYS * DAY ? 'open' : 'archive';
}

export type SuggestionSort = 'recent' | 'votes';
export function sortSuggestions(items: SongSuggestion[], sort: SuggestionSort): SongSuggestion[] {
  const recent = (a: SongSuggestion, b: SongSuggestion) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return [...items].sort(sort === 'votes' ? (a, b) => b.votes - a.votes || recent(a, b) : recent);
}

/** "Lugar Secreto (Ao Vivo)" and "lugar secreto" are the same song. */
export function normalizeTitle(text: string): string {
  return normalizeSearch(text)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NOISE =
  /\s*[([](?:[^)\]]*(?:ao vivo|live|oficial|official|clipe|clip|video|vídeo|lyric|letra|playback|ac[uú]stic|audio|áudio|cover|legendado|hd|4k)[^)\]]*)[)\]]\s*/gi;
const CHANNEL_NOISE = /\s*(?:-\s*topic|vevo|oficial|official|tv|music|m[uú]sica)\s*$/i;

function tidy(text: string): string {
  return text
    .replace(NOISE, ' ')
    .replace(/\s*(?:\||•|·).*$/, '')
    .replace(/\s*(?:#\S+\s*)+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * Best guess of song and artist from a YouTube result, which the person can still edit.
 * "Gabriela Rocha - Lugar Secreto (Ao Vivo)" → artist Gabriela Rocha, title Lugar Secreto.
 */
export function guessSongFromVideo(videoTitle: string, channel = ''): { title: string; artist: string } {
  const cleanChannel = channel.replace(CHANNEL_NOISE, '').trim().slice(0, 160);
  const parts = videoTitle.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const left = tidy(parts[0]);
    const right = tidy(parts.slice(1).join(' - '));
    // When the channel matches the right side, the title came first ("Lugar Secreto - Gabriela Rocha").
    if (
      cleanChannel &&
      normalizeTitle(right).includes(normalizeTitle(cleanChannel)) &&
      !normalizeTitle(left).includes(normalizeTitle(cleanChannel))
    )
      return { title: left, artist: right };
    if (left && right) return { title: right, artist: left };
  }
  return { title: tidy(videoTitle), artist: cleanChannel };
}

export interface SuggestionDuplicates {
  songs: Song[];
  suggestions: SongSuggestion[];
  /** The same video is already waiting for a decision: like that one instead. */
  sameOpenVideo?: SongSuggestion;
}

export function findSuggestionDuplicates(
  title: string,
  videoId: string,
  songs: Song[],
  suggestions: SongSuggestion[] = [],
): SuggestionDuplicates {
  const key = normalizeTitle(title);
  const sameTitle = (other: string) => key.length > 0 && normalizeTitle(other) === key;
  const isOpen = (item: SongSuggestion) => item.status === 'suggested' || item.status === 'reviewing';
  return {
    songs: songs.filter(song => sameTitle(song.title)),
    suggestions: suggestions.filter(item => item.status !== 'approved' && (item.videoId === videoId || sameTitle(item.title))),
    sameOpenVideo: suggestions.find(item => isOpen(item) && item.videoId === videoId),
  };
}

/** "agora", "há 5 min", "há 3 dias", "12/10". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
