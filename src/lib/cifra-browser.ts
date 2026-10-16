import { chordSheetMetadata, normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
import { chordSegments } from './music';
import { sourceArtist, sourceKey, type SongSearchResult } from './song-search';

const CHANNEL = 'candeia-cifraclub';
const VERSION = 1;
const MAX_TEXT = 100_000;
type Message = { channel: string; version: number; type: string; requestId: string; result?: unknown; error?: unknown; capabilities?: unknown; navigationStarted?: unknown };
type ExchangeOptions = { requestId?: string; mode?: 'same-tab'; returnUrl?: string };

function exchange(type: 'ping' | 'read' | 'resume', sourceUrl?: string, signal?: AbortSignal, options: ExchangeOptions = {}): Promise<Message | null> {
  if (signal?.aborted) return Promise.reject(signal.reason || new DOMException('Consulta cancelada.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const requestId = options.requestId || crypto.randomUUID();
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
      if (type !== 'ping') window.postMessage({ channel: CHANNEL, version: VERSION, type: 'cancel', requestId }, origin);
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
    window.postMessage({ channel: CHANNEL, version: VERSION, type, requestId, ...(sourceUrl ? { sourceUrl } : {}),
      ...(options.mode ? { mode: options.mode } : {}), ...(options.returnUrl ? { returnUrl: options.returnUrl } : {}) }, origin);
  });
}

export async function detectCifraBrowser(signal?: AbortSignal): Promise<boolean> {
  return (await cifraBrowserStatus(signal)) === 'connected';
}

/** Android's installed Firefox window cannot reliably foreground tabs.create(). */
export function isFirefoxInstalledApp(): boolean {
  return /Android/i.test(navigator.userAgent) && /Firefox\//i.test(navigator.userAgent)
    && ['standalone', 'fullscreen', 'minimal-ui'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches);
}

export async function cifraBrowserStatus(signal?: AbortSignal, requireSameTab = false): Promise<'connected' | 'outdated' | 'missing'> {
  const response = await exchange('ping', undefined, signal);
  if (!response) return 'missing';
  return Array.isArray(response.capabilities) && response.capabilities.includes('written-key-capo')
    && (!requireSameTab || response.capabilities.includes('same-tab-return')) ? 'connected' : 'outdated';
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
    || (raw.displayedKey !== undefined && (typeof raw.displayedKey !== 'string' || raw.displayedKey.length > 12))
    || (raw.soundingKey !== undefined && (typeof raw.soundingKey !== 'string' || raw.soundingKey.length > 12))
    || (raw.capo !== undefined && (!Number.isInteger(raw.capo) || (raw.capo as number) < 0 || (raw.capo as number) > 12))
    || (raw.keyUnknownReason !== undefined && (typeof raw.keyUnknownReason !== 'string' || raw.keyUnknownReason.length > 300))) {
    throw new Error('A extensão retornou dados de outra versão ou um conteúdo inválido.');
  }
  const parsed = parseCifraClubText(raw.text);
  if (parsed.content.length > MAX_TEXT || !chordSegments(parsed.content).some(segment => segment.chord)) {
    throw new Error('Não foi possível reconhecer os acordes dessa página. Abra a cifra no Cifra Club e confira a versão.');
  }
  // The written shape key is the base for keyboard transposition, not a capo's sounding key.
  const displayedKey = sourceKey(typeof raw.displayedKey === 'string' ? raw.displayedKey : undefined);
  const capo = typeof raw.capo === 'number' ? raw.capo : parsed.capo;
  // Capo often lives outside PRE. Include it when interpreting the header so a
  // sounding key is never reused as a written shape key merely because the reason was omitted.
  const metadata = chordSheetMetadata(`${capo !== undefined ? `Capotraste: ${capo}\n` : ''}${raw.text}`);
  const conflictingCapo = typeof raw.capo === 'number' && parsed.capo !== undefined && raw.capo !== parsed.capo;
  const unknownReason = conflictingCapo ? 'A fonte informa posições de capotraste diferentes. Confirme o tom dos acordes escritos.'
    : typeof raw.keyUnknownReason === 'string' ? raw.keyUnknownReason : metadata.keyUnknownReason;
  const writtenKey = displayedKey || (!unknownReason ? metadata.originalKey : undefined);
  return { ...result, id: requested, sourceUrl: requested, kind: 'chords', title: raw.title.trim() || result.title,
    artist: sourceArtist(raw.artist, result.artist), content: parsed.content,
    originalKey: writtenKey, capo,
    soundingKey: sourceKey(typeof raw.soundingKey === 'string' ? raw.soundingKey : parsed.soundingKey) || undefined,
    keyUnknownReason: writtenKey ? undefined : unknownReason || (capo ? 'A fonte usa capotraste. Confirme o tom dos acordes escritos para converter a cifra.' : undefined) };
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
  if (!Array.isArray(response.capabilities) || !response.capabilities.includes('written-key-capo')) {
    throw new Error('Atualize o importador Cifra Club para reconhecer o tom dos acordes e o capotraste.');
  }
  return parseBrowserCifra(result, response.result);
}

const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function beginCifraInCurrentTab(result: SongSearchResult, requestId: string, returnUrl: string, signal?: AbortSignal): Promise<void> {
  const sourceUrl = normalizeCifraClubUrl(result.sourceUrl);
  let destination: URL;
  try { destination = new URL(returnUrl); } catch { throw new Error('O endereço de retorno da importação é inválido.'); }
  if (result.source !== 'Cifra Club' || !sourceUrl || !REQUEST_ID.test(requestId)
    || destination.origin !== window.location.origin || destination.pathname !== '/musicas'
    || destination.username || destination.password || destination.hash || destination.href !== `${window.location.origin}/musicas?candeia_import=${requestId}`) {
    throw new Error('A consulta ou o endereço de retorno da importação é inválido.');
  }
  const response = await exchange('read', sourceUrl, signal, { requestId, mode: 'same-tab', returnUrl: destination.href });
  if (response?.error !== undefined) throw new Error(typeof response.error === 'string' && response.error.length <= 300 ? response.error : 'Não foi possível abrir o Cifra Club nesta janela.');
  if (!Array.isArray(response?.capabilities) || !response.capabilities.includes('written-key-capo')
    || !response.capabilities.includes('same-tab-return') || response.navigationStarted !== true) {
    throw new Error('Atualize o importador Firefox para a versão 1.1.2 ou superior para importar pelo aplicativo instalado.');
  }
}

// StrictMode may remount the page while the worker consumes a result. Share the
// pending promise, including errors, briefly; never abort it merely on unmount.
const resumedReads = new Map<string, { started: number; promise: Promise<SongSearchResult> }>();
export function resumeCifraFromBrowser(result: SongSearchResult, requestId: string): Promise<SongSearchResult> {
  if (!REQUEST_ID.test(requestId)) return Promise.reject(new Error('A consulta de retorno é inválida.'));
  const key = `${requestId}:${normalizeCifraClubUrl(result.sourceUrl) || ''}`;
  for (const [id, entry] of resumedReads) if (Date.now() - entry.started > 5 * 60_000) resumedReads.delete(id);
  const existing = resumedReads.get(key);
  if (existing) return existing.promise;
  if (resumedReads.size >= 10) resumedReads.delete(resumedReads.keys().next().value!);
  const promise = (async () => {
    const response = await exchange('resume', undefined, undefined, { requestId });
    if (response?.error !== undefined) throw new Error(typeof response.error === 'string' && response.error.length <= 300 ? response.error : 'Não foi possível recuperar esta consulta. Pesquise a versão novamente.');
    if (!Array.isArray(response?.capabilities) || !response.capabilities.includes('written-key-capo')
      || !response.capabilities.includes('same-tab-return')) throw new Error('Atualize o importador Firefox para a versão 1.1.2 ou superior.');
    return parseBrowserCifra(result, response.result);
  })();
  resumedReads.set(key, { started: Date.now(), promise });
  return promise;
}
