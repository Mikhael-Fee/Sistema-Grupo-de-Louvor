import { normalizeCifraClubUrl } from './cifraclub';
import type { SongSearchResult } from './song-search';

export const CURRENT_TAB_IMPORT_KEY = 'candeia.cifra-current-tab.v1';
export const CURRENT_TAB_IMPORT_TTL = 5 * 60_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type CurrentTabImport = {
  version: 1; accountId: string; requestId: string; target: 'new' | string;
  source: SongSearchResult; useSourceMetadata: boolean; expires: number;
};

/** Only source selection and the editor identity travel across page navigation.
 * Fields, tags, notes and key preferences stay in their existing account draft. */
export function saveCurrentTabImport(accountId: string, target: string, source: SongSearchResult, useSourceMetadata: boolean): CurrentTabImport {
  const sourceUrl = normalizeCifraClubUrl(source.sourceUrl);
  if (!UUID.test(accountId) || (target !== 'new' && !UUID.test(target)) || source.source !== 'Cifra Club' || !sourceUrl
    || typeof source.title !== 'string' || source.title.length > 200 || typeof source.artist !== 'string' || source.artist.length > 200) {
    throw new Error('A consulta não pode ser vinculada a este editor. Feche e abra a música novamente.');
  }
  const pending: CurrentTabImport = { version: 1, accountId, target, requestId: crypto.randomUUID(),
    source: { id: sourceUrl, sourceUrl, source: 'Cifra Club', kind: 'chords', title: source.title, artist: source.artist },
    useSourceMetadata, expires: Date.now() + CURRENT_TAB_IMPORT_TTL };
  try {
    const encoded = JSON.stringify(pending);
    sessionStorage.setItem(CURRENT_TAB_IMPORT_KEY, encoded);
    if (sessionStorage.getItem(CURRENT_TAB_IMPORT_KEY) !== encoded) throw new Error();
  } catch { throw new Error('Permita o armazenamento desta aba para preservar seu rascunho durante a importação.'); }
  return pending;
}

export function clearCurrentTabImport(requestId?: string): void {
  try {
    if (requestId) {
      const value = JSON.parse(sessionStorage.getItem(CURRENT_TAB_IMPORT_KEY) || 'null');
      if (value?.requestId !== requestId) return;
    }
    sessionStorage.removeItem(CURRENT_TAB_IMPORT_KEY);
  } catch { /* The regular editor remains usable if storage is unavailable. */ }
}

export function pendingCurrentTabImport(accountId: string, returnRequestId: string | null): { pending: CurrentTabImport | null; error?: string } {
  let stored: string | null;
  try { stored = sessionStorage.getItem(CURRENT_TAB_IMPORT_KEY); }
  catch {
    // Browsing the library never requires storage for this optional importer.
    if (!returnRequestId) return { pending: null };
    return { pending: null, error: 'Os dados desta consulta não estão disponíveis. Seu rascunho foi mantido; pesquise a versão novamente.' };
  }
  let value: unknown;
  try { value = JSON.parse(stored || 'null'); }
  catch { clearCurrentTabImport(); return { pending: null, error: 'Os dados desta consulta não estão disponíveis. Seu rascunho foi mantido; pesquise a versão novamente.' }; }
  if (!value && !returnRequestId) return { pending: null };
  const invalid = (message: string) => { clearCurrentTabImport(); return { pending: null, error: message }; };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Esta consulta não está mais disponível. Pesquise a versão novamente.');
  const candidate = value as CurrentTabImport;
  if (candidate.accountId !== accountId) return invalid('Esta consulta pertence a outra sessão. Entre com a conta que iniciou a importação e pesquise novamente.');
  if (candidate.version !== 1 || !UUID.test(candidate.accountId) || !UUID.test(candidate.requestId)
    || (candidate.target !== 'new' && !UUID.test(candidate.target)) || typeof candidate.useSourceMetadata !== 'boolean'
    || typeof candidate.expires !== 'number' || !Number.isFinite(candidate.expires)
    || !candidate.source || candidate.source.source !== 'Cifra Club' || candidate.source.kind !== 'chords'
    || typeof candidate.source.sourceUrl !== 'string' || normalizeCifraClubUrl(candidate.source.sourceUrl) !== candidate.source.sourceUrl
    || typeof candidate.source.title !== 'string' || candidate.source.title.length > 200
    || typeof candidate.source.artist !== 'string' || candidate.source.artist.length > 200
    || (returnRequestId !== null && (!UUID.test(returnRequestId) || returnRequestId !== candidate.requestId))) {
    return invalid('Os dados desta consulta são inválidos. Seu rascunho foi mantido; pesquise a versão novamente.');
  }
  if (candidate.expires < Date.now() || candidate.expires > Date.now() + CURRENT_TAB_IMPORT_TTL) return invalid('O prazo desta consulta terminou. Seu rascunho foi mantido; pesquise a versão novamente.');
  return { pending: { version: 1, accountId: candidate.accountId, requestId: candidate.requestId,
    target: candidate.target, useSourceMetadata: candidate.useSourceMetadata, expires: candidate.expires,
    source: { id: candidate.source.sourceUrl, sourceUrl: candidate.source.sourceUrl, source: 'Cifra Club', kind: 'chords',
      title: candidate.source.title, artist: candidate.source.artist } } };
}
