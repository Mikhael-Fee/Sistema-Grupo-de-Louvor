import { KEYS } from './music';
import { buildCifraClubSearchUrl, normalizeCifraClubUrl } from './cifraclub';

export type SongImportKind = 'lyrics' | 'chords';
export interface SongSearchResult {
  id: string;
  title: string;
  artist: string;
  source: 'LRCLIB' | 'Worship Together' | 'Cifra Club';
  sourceUrl: string;
  kind: SongImportKind;
  content?: string;
  originalKey?: string;
  soundingKey?: string;
  capo?: number;
  keyUnknownReason?: string;
  album?: string;
}

/** A navigation heading must never replace the artist of the chosen search result. */
export function sourceArtist(value: unknown, fallback = ''): string {
  const usable = (candidate: unknown) => typeof candidate === 'string'
    && candidate.trim() && !/^(?:menu\s+principal|main\s+menu|navegação\s+principal|cifra\s+club)$/i.test(candidate.trim());
  return usable(value) ? (value as string).trim() : usable(fallback) ? fallback.trim() : '';
}

export function cifraClubSearchUrl(title: string, artist: string): string {
  return buildCifraClubSearchUrl(title, artist);
}

export function isSafeCifraClubUrl(value: string): boolean {
  return normalizeCifraClubUrl(value) !== null;
}

export function cifraClubUrlFromNotes(notes: string): string {
  const links = notes.match(/https:\/\/(?:www\.)?cifraclub\.com\.br\/[^\s<>]+/gi) || [];
  return links.map(link => link.replace(/[.,;)'"\]]+$/, '')).find(isSafeCifraClubUrl) || '';
}

export function notesWithCifraClubSource(notes: string, value: string): string {
  const prefix = 'Fonte da cifra: Cifra Club — ';
  const kept = notes.split('\n').filter(line => !line.startsWith(prefix) || (!value.trim() && !isSafeCifraClubUrl(line.slice(prefix.length)))).join('\n').trim();
  if (!value.trim()) return kept;
  if (!isSafeCifraClubUrl(value.trim())) throw new Error('Informe o link HTTPS de uma música no Cifra Club ou deixe o campo vazio.');
  return `${kept}${kept ? '\n\n' : ''}${prefix}${normalizeCifraClubUrl(value.trim())}`;
}

export function sourceKey(value?: string): string | null {
  const root = /^([A-G](?:#|b)?)(?:m|maj|min)?$/.exec(value?.trim() || '')?.[1];
  if (!root) return null;
  const equivalent: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb', 'B#': 'C', Cb: 'B', Fb: 'E', 'E#': 'F' };
  const key = equivalent[root] || root;
  return KEYS.includes(key) ? key : null;
}

function readLyrics(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^\[\d{2}:\d{2}(?:\.\d+)?\]\s*/gm, '').trim();
}

export function mapLyricsResults(value: unknown): SongSearchResult[] {
  if (!Array.isArray(value)) throw new Error('A fonte retornou uma resposta de letras inválida.');
  const seen = new Set<string>();
  const results: SongSearchResult[] = [];
  for (const track of value) {
    if (!track || typeof track !== 'object' || typeof track.trackName !== 'string' || typeof track.artistName !== 'string' || !Number.isSafeInteger(track.id)) continue;
    const content = readLyrics(track.plainLyrics || track.syncedLyrics);
    if (track.instrumental || !content || content.length > 100_000) continue;
    const signature = `${track.trackName}\n${track.artistName}\n${content}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push({ id: String(track.id), title: track.trackName, artist: track.artistName, album: typeof track.albumName === 'string' ? track.albumName : undefined, content, source: 'LRCLIB', sourceUrl: `https://lrclib.net/api/get/${track.id}`, kind: 'lyrics' });
  }
  return results.slice(0, 12);
}

export async function searchSongSources(title: string, artist: string, kind: SongImportKind, signal?: AbortSignal): Promise<SongSearchResult[]> {
  if (title.trim().length < 2) throw new Error('Informe pelo menos dois caracteres do título para buscar.');
  const params = new URLSearchParams();
  let url: string;
  if (kind === 'lyrics') {
    params.set('track_name', title.trim());
    if (artist.trim()) params.set('artist_name', artist.trim());
    url = `https://lrclib.net/api/search?${params}`;
  } else {
    params.set('title', title.trim());
    if (artist.trim()) params.set('artist', artist.trim());
    url = `/.netlify/functions/song-search?${params}`;
  }
  let response: Response;
  try { response = await fetch(url, { signal, headers: { Accept: 'application/json' } }); }
  catch (cause) { if (signal?.aborted) throw cause; throw new Error('Não foi possível acessar a fonte. Confira sua conexão e tente novamente.'); }
  if (!response.ok) {
    if (kind === 'chords') {
      const body = await response.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
      if (response.status === 404) throw new Error('A busca de cifras precisa da função de consulta publicada. Você pode buscar letras agora ou colar uma cifra no campo.');
    }
    throw new Error(response.status === 429 ? 'A fonte recebeu muitas consultas. Aguarde um momento e tente novamente.' : 'A fonte está indisponível agora. Tente novamente em alguns instantes.');
  }
  const body = await response.json().catch(() => { throw new Error('A fonte retornou uma resposta inválida.'); });
  if (kind === 'lyrics') return mapLyricsResults(body);
  if (!Array.isArray(body?.results)) throw new Error('A busca de cifras precisa da função de consulta configurada no servidor.');
  return body.results;
}

export interface UnifiedSongSearch {
  results: SongSearchResult[];
  warnings: string[];
}

async function searchCifraClub(title: string, artist: string, signal?: AbortSignal): Promise<SongSearchResult[]> {
  const params = new URLSearchParams({ source: 'cifraclub', title: title.trim() });
  if (artist.trim()) params.set('artist', artist.trim());
  let response: Response;
  try { response = await fetch(`/.netlify/functions/song-search?${params}`, { signal, headers: { Accept: 'application/json' } }); }
  catch (cause) { if (signal?.aborted) throw cause; throw new Error('Não foi possível acessar a busca do Cifra Club.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.results)) throw new Error(body?.error || 'A busca do Cifra Club está indisponível agora.');
  return body.results.filter((item: SongSearchResult) => item?.source === 'Cifra Club' && item.kind === 'chords'
    && typeof item.title === 'string' && typeof item.artist === 'string' && typeof item.sourceUrl === 'string' && isSafeCifraClubUrl(item.sourceUrl)).slice(0, 12);
}

/** One search, Cifra Club versions first; a failed source does not hide the other one. */
export async function searchUnifiedSongSources(title: string, artist: string, signal?: AbortSignal): Promise<UnifiedSongSearch> {
  if (title.trim().length < 2) throw new Error('Informe pelo menos dois caracteres do título para buscar.');
  const timeout = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const outcomes = await Promise.allSettled([
    searchCifraClub(title, artist, requestSignal),
    searchSongSources(title, artist, 'lyrics', requestSignal),
  ]);
  if (signal?.aborted) throw signal.reason || new DOMException('Consulta cancelada.', 'AbortError');
  const results: SongSearchResult[] = [];
  const warnings: string[] = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') results.push(...outcome.value);
    else warnings.push(`${index === 0 ? 'Cifra Club' : 'LRCLIB'}: ${timeout.aborted ? 'a consulta demorou demais.' : outcome.reason instanceof Error ? outcome.reason.message : 'a consulta está indisponível agora.'}`);
  });
  return { results, warnings };
}

export const searchAllSongSources = searchUnifiedSongSources;

export async function previewSongSource(result: SongSearchResult, signal?: AbortSignal): Promise<SongSearchResult> {
  if (result.kind === 'lyrics' && result.content) return result;
  const timeout = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try { response = await fetch(`/.netlify/functions/song-search?${new URLSearchParams({ url: result.sourceUrl })}`, { signal: requestSignal, headers: { Accept: 'application/json' } }); }
  catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error(timeout.aborted ? 'A consulta à cifra demorou demais. Tente novamente.' : `Não foi possível abrir a cifra do ${result.source}. Confira sua conexão e tente novamente.`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.song || typeof body.song.content !== 'string') throw new Error(body?.error || 'Não foi possível abrir a prévia desta cifra.');
  return { ...body.song, artist: sourceArtist(body.song.artist, result.artist) };
}
