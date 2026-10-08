import { parseBrowserCifra } from './cifra-browser';
import { normalizeCifraClubUrl } from './cifraclub';
import type { SongSearchResult } from './song-search';

export const MOBILE_CIFRA_PREFIX = '#candeia-cifra=';
export const MAX_MOBILE_CIFRA = 100_000;
const STORAGE_KEY = 'candeia.mobile-cifra.v1';
let memory: { id: string; encoded: string } | null = null;
let captureError: string | null = null;

/** Public chart input is untrusted: validate it before displaying, never auto-save it. */
export function decodeMobileCifra(encoded: string): SongSearchResult {
  if (!encoded || encoded.length > MAX_MOBILE_CIFRA || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('A cifra recebida é inválida ou muito grande para transferir pelo celular.');
  }
  let envelope: { version?: unknown; result?: unknown };
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('Não foi possível ler a cifra recebida. Execute novamente o importador na página da música.'); }
  const raw = envelope?.result as Record<string, unknown> | undefined;
  if (envelope?.version !== 1 || !raw || typeof raw !== 'object' || Array.isArray(raw)
    || typeof raw.sourceUrl !== 'string' || raw.sourceUrl.length > 2_048) throw new Error('A transferência da cifra não é válida.');
  const url = normalizeCifraClubUrl(raw.sourceUrl);
  if (!url) throw new Error('A transferência precisa ser de uma música do Cifra Club.');
  return parseBrowserCifra({ id: url, sourceUrl: url, source: 'Cifra Club', kind: 'chords', title: '', artist: '' }, raw);
}

/** Run before Supabase initialization, removing only our own fragment namespace. */
export function captureMobileCifra(): void {
  if (window.location.pathname !== '/importar-cifra' || !window.location.hash.startsWith(MOBILE_CIFRA_PREFIX)) return;
  const encoded = window.location.hash.slice(MOBILE_CIFRA_PREFIX.length);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  clearPendingMobileCifra();
  try {
    decodeMobileCifra(encoded);
    memory = { id: crypto.randomUUID(), encoded };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* The current page remains usable without storage. */ }
  } catch (cause) { captureError = cause instanceof Error ? cause.message : 'A cifra recebida não pôde ser lida.'; }
}

export function pendingMobileCifra(): { id: string; song: SongSearchResult } | null {
  try {
    if (!memory) {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && typeof stored.id === 'string' && /^[0-9a-f-]{36}$/i.test(stored.id)
        && typeof stored.encoded === 'string' && stored.encoded.length <= MAX_MOBILE_CIFRA) memory = stored;
    }
    return memory ? { id: memory.id, song: decodeMobileCifra(memory.encoded) } : null;
  } catch { clearPendingMobileCifra(); captureError = 'A transferência guardada não é válida. Importe novamente pelo navegador.'; return null; }
}

export function mobileCifraError(): string | null { return captureError; }

export function clearPendingMobileCifra(): void {
  memory = null; captureError = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Clearing in-memory input is sufficient in this page. */ }
}
