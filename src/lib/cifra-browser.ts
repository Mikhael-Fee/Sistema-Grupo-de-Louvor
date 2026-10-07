import { normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
import { chordSegments } from './music';
import { sourceKey, type SongSearchResult } from './song-search';

const CHANNEL = 'candeia-cifraclub';
const VERSION = 1;
const MAX_TEXT = 100_000;
type Message = { channel: string; version: number; type: string; requestId: string; result?: unknown; error?: unknown };

function exchange(type: 'ping' | 'read', sourceUrl?: string, signal?: AbortSignal): Promise<Message | null> {
  if (signal?.aborted) return Promise.reject(signal.reason || new DOMException('Consulta cancelada.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const origin = window.location.origin;
    let finished = false;
    const cleanup = () => {
      finished = true;
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (finished) return;
      cleanup();
      if (type === 'read') window.postMessage({ channel: CHANNEL, version: VERSION, type: 'cancel', requestId }, origin);
      reject(signal?.reason || new DOMException('Consulta cancelada.', 'AbortError'));
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== origin || !event.data || typeof event.data !== 'object') return;
      const data = event.data as Message;
      if (data.channel !== CHANNEL || data.version !== VERSION || data.requestId !== requestId
        || data.type !== (type === 'ping' ? 'ready' : 'response')) return;
      cleanup();
      resolve(data);
    };
    const timeout = setTimeout(() => {
      if (type === 'ping') { cleanup(); resolve(null); }
      else {
        cleanup();
        window.postMessage({ channel: CHANNEL, version: VERSION, type: 'cancel', requestId }, origin);
        reject(new Error('A cifra não carregou no navegador a tempo. Abra a versão no Cifra Club e confira se ela está disponível.'));
      }
    }, type === 'ping' ? 900 : 40_000);
    window.addEventListener('message', receive);
    signal?.addEventListener('abort', cancel, { once: true });
    window.postMessage({ channel: CHANNEL, version: VERSION, type, requestId, ...(sourceUrl ? { sourceUrl } : {}) }, origin);
  });
}

export async function detectCifraBrowser(signal?: AbortSignal): Promise<boolean> {
  return Boolean(await exchange('ping', undefined, signal));
}

/** Public source data only; never consume tokens or modify the ministry here. */
export function parseBrowserCifra(result: SongSearchResult, value: unknown): SongSearchResult {
  const requested = normalizeCifraClubUrl(result.sourceUrl);
  if (result.source !== 'Cifra Club' || !requested || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A extensão não retornou uma cifra válida.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.sourceUrl !== 'string' || normalizeCifraClubUrl(raw.sourceUrl) !== requested
    || typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > MAX_TEXT
    || typeof raw.title !== 'string' || raw.title.length > 200
    || typeof raw.artist !== 'string' || raw.artist.length > 200
    || (raw.displayedKey !== undefined && (typeof raw.displayedKey !== 'string' || raw.displayedKey.length > 12))) {
    throw new Error('A extensão retornou dados de outra versão ou um conteúdo inválido.');
  }
  const parsed = parseCifraClubText(raw.text);
  if (parsed.content.length > MAX_TEXT || !chordSegments(parsed.content).some(segment => segment.chord)) {
    throw new Error('Não foi possível reconhecer os acordes dessa página. Abra a cifra no Cifra Club e confira a versão.');
  }
  // Read the displayed key: the user's page may already have been transposed.
  const displayedKey = sourceKey(typeof raw.displayedKey === 'string' ? raw.displayedKey : undefined);
  return { ...result, id: requested, sourceUrl: requested, kind: 'chords', title: raw.title.trim() || result.title,
    artist: raw.artist.trim() || result.artist, content: parsed.content,
    originalKey: displayedKey || parsed.originalKey };
}

export async function readCifraFromBrowser(result: SongSearchResult, signal?: AbortSignal): Promise<SongSearchResult> {
  const sourceUrl = normalizeCifraClubUrl(result.sourceUrl);
  if (result.source !== 'Cifra Club' || !sourceUrl) throw new Error('Escolha uma versão válida do Cifra Club.');
  const response = await exchange('read', sourceUrl, signal);
  if (!response) throw new Error('Conecte o importador Cifra Club no navegador para continuar.');
  if (response.error !== undefined) {
    throw new Error(typeof response.error === 'string' && response.error.length <= 300
      ? response.error : 'Não foi possível ler a cifra no navegador.');
  }
  return parseBrowserCifra(result, response.result);
}
