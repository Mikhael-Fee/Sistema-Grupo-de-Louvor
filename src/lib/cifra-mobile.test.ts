import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMobileCifra, clearPendingMobileCifra, decodeMobileCifra, MAX_MOBILE_CIFRA, mobileCifraError, pendingMobileCifra } from './cifra-mobile';

const result = { sourceUrl: 'https://www.cifraclub.com.br/gabriela-rocha/me-atraiu/', title: 'Me Atraiu',
  artist: 'Gabriela Rocha', displayedKey: 'G', soundingKey: 'Bb', capo: 3, text: 'G D/F#\nTua presença me atraiu\ne|--0--2--3--|' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => items.get(key) || null,
    setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) });
  clearPendingMobileCifra();
});
afterEach(() => { clearPendingMobileCifra(); vi.unstubAllGlobals(); });

describe('transferência de cifra pelo celular', () => {
  it('preserva UTF-8, separa posições de capotraste e remove tablatura', () => {
    const song = decodeMobileCifra(encode({ version: 1, result }));
    expect(song).toMatchObject({ title: 'Me Atraiu', artist: 'Gabriela Rocha', originalKey: 'G', soundingKey: 'Bb', capo: 3 });
    expect(song.content).toContain('presença');
    expect(song.content).toContain('[G]');
    expect(song.content).not.toContain('e|');
  });
  it.each([null, { version: 2, result }, { version: 1, result: { ...result, sourceUrl: 'https://example.com/a/b/' } },
    { version: 1, result: { ...result, sourceUrl: 'https://www.cifraclub.com.br@evil.example/a/b/' } },
    { version: 1, result: { ...result, capo: 13 } }])('rejeita envelope ou origem inválida %#', envelope => {
    expect(() => decodeMobileCifra(encode(envelope))).toThrow();
  });
  it('rejeita dados acima do limite e bytes UTF-8 inválidos sem truncar', () => {
    expect(() => decodeMobileCifra('A'.repeat(MAX_MOBILE_CIFRA + 1))).toThrow(/grande/);
    expect(() => decodeMobileCifra('_w')).toThrow(/ler/);
  });
  it('remove apenas o fragmento da importação antes de guardar a prévia', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/importar-cifra', search: '?origem=celular', hash: `#candeia-cifra=${encode({ version: 1, result })}` },
      history: { state: { retained: true }, replaceState } });
    captureMobileCifra();
    expect(replaceState).toHaveBeenCalledWith({ retained: true }, '', '/importar-cifra?origem=celular');
    expect(pendingMobileCifra()?.song.title).toBe('Me Atraiu');
    expect(mobileCifraError()).toBeNull();
  });
  it('preserva fragmentos de confirmação de conta e recuperação de senha', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/importar-cifra', hash: '#access_token=fixture&type=recovery' }, history: { replaceState } });
    captureMobileCifra();
    expect(replaceState).not.toHaveBeenCalled();
    expect(pendingMobileCifra()).toBeNull();
  });
  it('mantém a prévia em memória se o navegador negar armazenamento', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('Storage denied'); },
      setItem: () => { throw new Error('Storage denied'); }, removeItem: () => { throw new Error('Storage denied'); } });
    vi.stubGlobal('window', { location: { pathname: '/importar-cifra', search: '', hash: `#candeia-cifra=${encode({ version: 1, result })}` }, history: { state: null, replaceState: vi.fn() } });
    captureMobileCifra();
    expect(pendingMobileCifra()?.song.artist).toBe('Gabriela Rocha');
    clearPendingMobileCifra();
    expect(pendingMobileCifra()).toBeNull();
  });
});
