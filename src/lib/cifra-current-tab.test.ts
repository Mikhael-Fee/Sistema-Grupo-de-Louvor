import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCurrentTabImport, CURRENT_TAB_IMPORT_KEY, CURRENT_TAB_IMPORT_TTL, pendingCurrentTabImport, saveCurrentTabImport } from './cifra-current-tab';
import type { SongSearchResult } from './song-search';

const ACCOUNT = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const SONG = '20000000-0000-4000-8000-000000000003';
const SOURCE: SongSearchResult = { id: 'search-id', title: 'Luz', artist: 'Equipe', source: 'Cifra Club', kind: 'chords', sourceUrl: 'https://www.cifraclub.com.br/equipe/luz/' };
let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  storage = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('contexto da consulta na mesma janela', () => {
  it('persiste só seleção pública e identifica exatamente o rascunho original da conta', () => {
    const pending = saveCurrentTabImport(ACCOUNT, SONG, { ...SOURCE, content: 'Texto já lido', album: 'Outro campo' }, true);
    expect(pendingCurrentTabImport(ACCOUNT, pending.requestId)).toEqual({ pending });
    expect(pending.target).toBe(SONG);
    expect(pending.useSourceMetadata).toBe(true);
    expect(pending.source).not.toHaveProperty('content');
    expect(pending.source).not.toHaveProperty('album');
    expect(pending.expires).toBe(Date.now() + CURRENT_TAB_IMPORT_TTL);
    expect(JSON.stringify(pending)).not.toContain('token');
  });
  it('retoma pelo botão Voltar sem depender de parâmetro na URL', () => {
    const pending = saveCurrentTabImport(ACCOUNT, 'new', SOURCE, false);
    expect(pendingCurrentTabImport(ACCOUNT, null).pending).toEqual(pending);
  });
  it('não abre a música de outra conta e não apaga seus rascunhos', () => {
    storage.set('candeia.draft.v1:supabase:account:song:new', 'rascunho');
    saveCurrentTabImport(ACCOUNT, SONG, SOURCE, false);
    expect(pendingCurrentTabImport(OTHER, null).error).toMatch(/outra sessão/);
    expect(storage.has(CURRENT_TAB_IMPORT_KEY)).toBe(false);
    expect(storage.get('candeia.draft.v1:supabase:account:song:new')).toBe('rascunho');
  });
  it('vence após cinco minutos e conserva o texto original', () => {
    saveCurrentTabImport(ACCOUNT, 'new', SOURCE, false);
    storage.set('draft', 'texto');
    vi.advanceTimersByTime(CURRENT_TAB_IMPORT_TTL + 1);
    expect(pendingCurrentTabImport(ACCOUNT, null).error).toMatch(/prazo/);
    expect(storage.get('draft')).toBe('texto');
  });
  it.each([
    '{',
    '[]',
    JSON.stringify({ version: 1, accountId: ACCOUNT, requestId: crypto.randomUUID(), target: 'new', source: { ...SOURCE, sourceUrl: 'https://example.com/roubar/' }, expires: 1 }),
  ])('descarta contexto malformado sem iniciar consulta %#', stored => {
    storage.set(CURRENT_TAB_IMPORT_KEY, stored);
    expect(pendingCurrentTabImport(ACCOUNT, null)).toMatchObject({ pending: null, error: expect.any(String) });
    expect(storage.has(CURRENT_TAB_IMPORT_KEY)).toBe(false);
  });
  it('rejeita um link de retorno sem o mesmo identificador', () => {
    saveCurrentTabImport(ACCOUNT, SONG, SOURCE, false);
    expect(pendingCurrentTabImport(ACCOUNT, crypto.randomUUID()).error).toMatch(/inválidos/);
  });
  it('limpa apenas a solicitação informada ao finalizar uma consulta anterior', () => {
    saveCurrentTabImport(ACCOUNT, 'new', SOURCE, false);
    const latest = saveCurrentTabImport(ACCOUNT, SONG, SOURCE, true);
    clearCurrentTabImport(crypto.randomUUID());
    expect(pendingCurrentTabImport(ACCOUNT, null).pending).toEqual(latest);
    clearCurrentTabImport(latest.requestId);
    expect(pendingCurrentTabImport(ACCOUNT, null)).toEqual({ pending: null });
  });
  it('não navega quando o navegador recusa armazenamento', () => {
    vi.stubGlobal('sessionStorage', { setItem: () => { throw new Error('denied'); } });
    expect(() => saveCurrentTabImport(ACCOUNT, SONG, SOURCE, false)).toThrow(/armazenamento/);
  });
  it('não apresenta erro de importação na biblioteca comum com armazenamento indisponível', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('denied'); } });
    expect(pendingCurrentTabImport(ACCOUNT, null)).toEqual({ pending: null });
    expect(pendingCurrentTabImport(ACCOUNT, crypto.randomUUID())).toMatchObject({ pending: null, error: expect.any(String) });
  });
  it('não aceita destinos ou fontes que possam abrir o editor errado', () => {
    expect(() => saveCurrentTabImport(ACCOUNT, '../perfil', SOURCE, false)).toThrow();
    expect(() => saveCurrentTabImport(ACCOUNT, SONG, { ...SOURCE, source: 'LRCLIB' }, false)).toThrow();
    expect(storage.size).toBe(0);
  });
});
