import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCifraBrowser, parseBrowserCifra, readCifraFromBrowser } from './cifra-browser';
import type { SongSearchResult } from './song-search';

const source: SongSearchResult = { id: 'chosen', title: 'Canção de teste', artist: 'Equipe de teste',
  source: 'Cifra Club', kind: 'chords', sourceUrl: 'https://www.cifraclub.com.br/equipe/cancao-de-teste/' };
const payload = { sourceUrl: source.sourceUrl, title: 'Versão escolhida', artist: 'Equipe', displayedKey: 'F',
  text: 'F          C\nNossa luz nos guia\nDm         Bb\nSeguimos em paz' };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('cifra recebida do navegador', () => {
  it('converte acordes, conserva versão e usa o tom exibido', () => {
    const parsed = parseBrowserCifra(source, payload);
    expect(parsed.content).toContain('[F]');
    expect(parsed.content).toContain('[Bb]');
    expect(parsed.originalKey).toBe('F');
    expect(parsed.sourceUrl).toBe(source.sourceUrl);
  });
  it('reconhece URL canônica equivalente e mantém metadados da busca se vazios', () => {
    const parsed = parseBrowserCifra(source, { ...payload, sourceUrl: 'https://cifraclub.com.br/equipe/cancao-de-teste?utm_source=test', title: '', artist: '' });
    expect(parsed.title).toBe(source.title);
    expect(parsed.artist).toBe(source.artist);
  });
  it.each([
    { ...payload, sourceUrl: 'https://www.cifraclub.com.br/equipe/outra-cancao/' },
    { ...payload, sourceUrl: 'https://example.com/equipe/cancao-de-teste/' },
    { ...payload, text: 'Uma letra sem nenhum acorde' },
    { ...payload, text: 'A'.repeat(100_001) },
    { ...payload, title: 'A'.repeat(201) },
    { ...payload, artist: null },
    { ...payload, displayedKey: { value: 'F' } },
  ])('rejeita outra versão, dado malformado ou conteúdo fora dos limites %#', data => {
    expect(() => parseBrowserCifra(source, data)).toThrow();
  });
});

function messageBus() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sent: Record<string, unknown>[] = [];
  const mockWindow = {
    location: { origin: 'https://louvor-grupo-fxebsy.netlify.app' },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
    postMessage: (data: Record<string, unknown>) => { sent.push(data); },
  };
  vi.stubGlobal('window', mockWindow);
  return { sent, listeners,
    respond(data: Record<string, unknown>, origin = mockWindow.location.origin, sender: unknown = mockWindow) {
      for (const fn of [...listeners]) fn({ data, origin, source: sender } as MessageEvent);
    } };
}

describe('canal do importador', () => {
  it('aceita só a resposta da mesma janela/origem/solicitação', async () => {
    const bus = messageBus();
    const pending = detectCifraBrowser();
    const ready = { ...bus.sent[0], type: 'ready' };
    bus.respond(ready, 'https://example.com');
    bus.respond(ready, undefined, {});
    bus.respond({ ...ready, requestId: 'unrelated' });
    expect(bus.listeners.size).toBe(1);
    bus.respond(ready);
    expect(await pending).toBe(true);
    expect(bus.listeners.size).toBe(0);
  });
  it('encerra a detecção sem extensão e remove o listener', async () => {
    vi.useFakeTimers();
    const bus = messageBus();
    const pending = detectCifraBrowser();
    await vi.advanceTimersByTimeAsync(901);
    expect(await pending).toBe(false);
    expect(bus.listeners.size).toBe(0);
  });
  it('cancela a consulta e ignora uma resposta tardia', async () => {
    const bus = messageBus();
    const controller = new AbortController();
    const pending = readCifraFromBrowser(source, controller.signal);
    const request = bus.sent[0];
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    expect(bus.sent[1]).toEqual({ ...request, sourceUrl: undefined, type: 'cancel' });
    bus.respond({ ...request, type: 'response', result: payload });
    expect(bus.listeners.size).toBe(0);
  });
  it('entrega a cifra como prévia e libera os recursos da solicitação', async () => {
    const bus = messageBus();
    const pending = readCifraFromBrowser(source);
    bus.respond({ ...bus.sent[0], type: 'response', result: payload });
    expect((await pending).originalKey).toBe('F');
    expect(bus.listeners.size).toBe(0);
  });
});
