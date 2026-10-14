import { supabase } from './backend';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/** Accept an actual video, never a channel, playlist, redirect, or lookalike host. */
export function getYouTubeVideoId(value: string | undefined | null): string | null {
  if (!value?.trim() || value.length > 2_000) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    else if (VIDEO_HOSTS.has(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}

export function normalizeYouTubeUrl(value: string | undefined | null): string | null {
  const id = getYouTubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function youtubeThumbnailUrl(value: string): string | null {
  const id = VIDEO_ID.test(value) ? value : getYouTubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function buildYouTubeSearchUrl(title: string, artist = ''): string {
  return `https://www.youtube.com/results?${new URLSearchParams({ search_query: [title.trim(), artist.trim()].filter(Boolean).join(' ') })}`;
}

export interface YouTubeSuggestion { id: string; title: string; channel: string; url: string; thumbnailUrl: string }
export interface YouTubeSearchResponse { results: YouTubeSuggestion[]; warning?: string }

export async function searchYouTubeVideos(title: string, artist: string, signal?: AbortSignal): Promise<YouTubeSearchResponse> {
  if (title.trim().length < 2) throw new Error('Informe pelo menos dois caracteres do título para buscar vídeos.');
  if (!supabase) throw new Error('Entre na sua conta para buscar vídeos.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Entre novamente na sua conta para buscar vídeos.');
  if (signal?.aborted) throw signal.reason;
  const requestSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]);
  let response: Response;
  try {
    response = await fetch(`/.netlify/functions/youtube-search?${new URLSearchParams({ title: title.trim().slice(0, 200), artist: artist.trim().slice(0, 200) })}`, {
      signal: requestSignal, headers: { Accept: 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    });
  } catch (cause) { if (signal?.aborted) throw cause; throw new Error('A busca de vídeos não respondeu. Você pode abrir a busca no YouTube e colar o link da versão escolhida.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'A busca de vídeos está indisponível. Abra a busca no YouTube e cole o link da versão escolhida.');
  if (!Array.isArray(body?.results)) throw new Error('A busca de vídeos retornou uma resposta inválida.');
  const seen = new Set<string>();
  const results: YouTubeSuggestion[] = [];
  for (const item of body.results.slice(0, 12)) {
    if (!item || typeof item.id !== 'string' || !VIDEO_ID.test(item.id) || typeof item.title !== 'string' || !item.title.trim() || seen.has(item.id)) continue;
    const url = normalizeYouTubeUrl(item.url);
    if (!url || getYouTubeVideoId(url) !== item.id) continue;
    seen.add(item.id);
    results.push({ id: item.id, title: item.title.slice(0, 200), channel: typeof item.channel === 'string' ? item.channel.slice(0, 200) : '', url, thumbnailUrl: youtubeThumbnailUrl(item.id)! });
  }
  return { results, ...(typeof body.warning === 'string' ? { warning: body.warning.slice(0, 500) } : {}) };
}
