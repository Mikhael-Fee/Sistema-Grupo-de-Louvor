import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginCifraInCurrentTab, cifraBrowserStatus, detectCifraBrowser, isFirefoxInstalledApp, parseBrowserCifra, readCifraFromBrowser, resumeCifraFromBrowser } from './cifra-browser';
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
  it('ignora Menu principal retornado por um importador anterior e usa o artista da versão escolhida', () => {
    expect(parseBrowserCifra(source, { ...payload, artist: ' Menu principal ' }).artist).toBe(source.artist);
    expect(parseBrowserCifra(source, { ...payload, artist: '' }).artist).toBe(source.artist);
  });
  it('preserva o tom das posições escritas separado do som com capotraste', () => {
    const parsed = parseBrowserCifra(source, { ...payload, displayedKey: 'G', soundingKey: 'Bb', capo: 3,
      text: 'G D/F#\nNossa luz\ne|--0--2--3--|\nB|--1--3--0--|' });
    expect(parsed).toMatchObject({ originalKey: 'G', soundingKey: 'Bb', capo: 3 });
    expect(parsed.content).toContain('[G]');
    expect(parsed.content).not.toContain('e|');
  });
  it('não reaproveita o header sonoro quando o capotraste não informa posições', () => {
    const parsed = parseBrowserCifra(source, { ...payload, displayedKey: undefined, capo: 3, soundingKey: 'Bb',
      keyUnknownReason: 'Confirme o tom dos acordes escritos.', text: 'Tom: Bb\nG D/F#\nNossa luz' });
    expect(parsed.originalKey).toBeUndefined();
    expect(parsed.keyUnknownReason).toMatch(/Confirme/);
  });
  it('considera capotraste fora do texto mesmo quando a extensão omite o motivo', () => {
    const parsed = parseBrowserCifra(source, { ...payload, displayedKey: undefined, capo: 3,
      soundingKey: 'Bb', text: 'Tom: Bb\nG D/F#\nNossa luz' });
    expect(parsed.originalKey).toBeUndefined();
    expect(parsed.keyUnknownReason).toMatch(/capotraste/);
    const explicit = parseBrowserCifra(source, { ...payload, displayedKey: undefined, capo: 3,
      text: 'Tom: Bb (forma dos acordes no tom de G)\nG D/F#\nNossa luz' });
    expect(explicit.originalKey).toBe('G');
  });
  it('pede confirmação quando o texto e a posição atual do capotraste divergem', () => {
    const parsed = parseBrowserCifra(source, { ...payload, displayedKey: undefined, capo: 0,
      text: 'Tom: Bb\nCapotraste: 3\nG\nNossa luz' });
    expect(parsed.originalKey).toBeUndefined();
    expect(parsed.keyUnknownReason).toMatch(/diferentes/);
  });
  it.each([
    { ...payload, sourceUrl: 'https://www.cifraclub.com.br/equipe/outra-cancao/' },
    { ...payload, sourceUrl: 'https://example.com/equipe/cancao-de-teste/' },
    { ...payload, text: 'Uma letra sem nenhum acorde' },
    { ...payload, text: 'A'.repeat(100_001) },
    { ...payload, title: 'A'.repeat(201) },
    { ...payload, artist: null },
    { ...payload, displayedKey: { value: 'F' } },
    { ...payload, capo: 13 },
    { ...payload, capo: 3.5 },
    { ...payload, soundingKey: {} },
    { ...payload, keyUnknownReason: 'A'.repeat(301) },
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
    const ready = { ...bus.sent[0], type: 'ready', capabilities: ['written-key-capo'] };
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
  it('avisa sobre importadores antigos que não distinguem tom e capotraste', async () => {
    const bus = messageBus();
    const pending = cifraBrowserStatus();
    bus.respond({ ...bus.sent[0], type: 'ready' });
    expect(await pending).toBe('outdated');
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
    bus.respond({ ...bus.sent[0], type: 'response', result: payload, capabilities: ['written-key-capo'] });
    expect((await pending).originalKey).toBe('F');
    expect(bus.listeners.size).toBe(0);
  });
  it('rejeita uma leitura de extensão antiga antes de usar seus acordes', async () => {
    const bus = messageBus();
    const pending = readCifraFromBrowser(source);
    bus.respond({ ...bus.sent[0], type: 'response', result: payload });
    await expect(pending).rejects.toThrow(/Atualize/);
  });
  it('exige retorno na mesma janela somente quando solicitado pelo aplicativo instalado', async () => {
    const bus = messageBus();
    const old = cifraBrowserStatus(undefined, true);
    bus.respond({ ...bus.sent[0], type: 'ready', capabilities: ['written-key-capo'] });
    expect(await old).toBe('outdated');
    const current = cifraBrowserStatus(undefined, true);
    bus.respond({ ...bus.sent[1], type: 'ready', capabilities: ['written-key-capo', 'same-tab-return'] });
    expect(await current).toBe('connected');
  });
  it('inicia a navegação somente com origem, destino e identificador exatos', async () => {
    const bus = messageBus();
    const id = crypto.randomUUID();
    const returnUrl = `https://louvor-grupo-fxebsy.netlify.app/musicas?candeia_import=${id}`;
    const pending = beginCifraInCurrentTab(source, id, returnUrl);
    expect(bus.sent[0]).toMatchObject({ type: 'read', mode: 'same-tab', sourceUrl: source.sourceUrl, returnUrl, requestId: id });
    bus.respond({ ...bus.sent[0], type: 'response', navigationStarted: true, capabilities: ['written-key-capo', 'same-tab-return'] });
    await expect(pending).resolves.toBeUndefined();
    await expect(beginCifraInCurrentTab(source, id, returnUrl.replace('/musicas?', '/perfil?'))).rejects.toThrow(/retorno/);
    await expect(beginCifraInCurrentTab(source, id, returnUrl.replace('louvor-grupo-fxebsy.netlify.app', 'example.com'))).rejects.toThrow(/retorno/);
    await expect(beginCifraInCurrentTab(source, id, `${returnUrl}&token=invalid`)).rejects.toThrow(/retorno/);
    expect(bus.sent).toHaveLength(1);
  });
  it('não interpreta ACK de extensão antiga como início de navegação', async () => {
    const bus = messageBus();
    const id = crypto.randomUUID();
    const pending = beginCifraInCurrentTab(source, id, `https://louvor-grupo-fxebsy.netlify.app/musicas?candeia_import=${id}`);
    bus.respond({ ...bus.sent[0], type: 'response', navigationStarted: true, capabilities: ['written-key-capo'] });
    await expect(pending).rejects.toThrow(/1\.1\.2/);
  });
  it('retoma uma única vez mesmo com montagem dupla e valida novamente a versão', async () => {
    const bus = messageBus();
    const id = crypto.randomUUID();
    const first = resumeCifraFromBrowser(source, id);
    const duplicate = resumeCifraFromBrowser(source, id);
    expect(duplicate).toBe(first);
    expect(bus.sent).toHaveLength(1);
    expect(bus.sent[0]).toEqual({ channel: 'candeia-cifraclub', version: 1, type: 'resume', requestId: id });
    bus.respond({ ...bus.sent[0], type: 'response', result: payload, capabilities: ['written-key-capo', 'same-tab-return'] });
    expect((await first).originalKey).toBe('F');
    expect(await duplicate).toEqual(await first);
    expect(bus.listeners.size).toBe(0);
  });
  it('propaga cancelamento antecipado do worker sem inventar uma cifra', async () => {
    const bus = messageBus();
    const pending = resumeCifraFromBrowser(source, crypto.randomUUID());
    bus.respond({ ...bus.sent[0], type: 'response', error: 'A consulta foi interrompida. Tente novamente.' });
    await expect(pending).rejects.toThrow(/interrompida/);
  });
});

describe('janela instalada Firefox Android', () => {
  it.each(['standalone', 'minimal-ui', 'fullscreen'])('reconhece modo %s', mode => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0' });
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === `(display-mode: ${mode})` }) });
    expect(isFirefoxInstalledApp()).toBe(true);
  });
  it.each([
    ['Mozilla/5.0 (Android 15; Mobile) Firefox/145.0', false],
    ['Mozilla/5.0 (Android 15; Mobile) Chrome/143.0', true],
    ['Mozilla/5.0 (X11; Linux) Firefox/145.0', true],
  ])('mantém o fluxo de abas para %s com instalação %s', (userAgent, installed) => {
    vi.stubGlobal('navigator', { userAgent });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: installed }) });
    expect(isFirefoxInstalledApp()).toBe(false);
  });
});
