import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parseCifraClubText } from './cifraclub';
import { stripChords } from './music';

const root = new URL('../../browser-extension/candeia-cifraclub/', import.meta.url);
const workerSource = readFileSync(new URL('background.js', root), 'utf8');
const readerSource = readFileSync(new URL('reader.js', root), 'utf8');
const contentSource = readFileSync(new URL('candeia-content.js', root), 'utf8');
const channel = 'candeia-cifraclub';
const origin = 'https://louvor-grupo-fxebsy.netlify.app';
const sourceUrl = 'https://www.cifraclub.com.br/equipe/luz/';
const requestId = 'cd90b390-2f77-47b2-8361-cd8010c58781';
const alternateId = 'fa34d72b-cf06-4df2-9f7b-88d0a1c437f0';
const importerMetadata = { importerVersion: '1.1.1', capabilities: ['written-key-capo'] };
type Sender = { frameId: number; tab: { id: number }; url: string };
type Listener = (message: Record<string, unknown>, sender: Sender, respond: (value: unknown) => void) => boolean;

function fakeWorker() {
  let listener: Listener = () => false;
  let removedListener: (id: number) => void = () => {};
  let nextTab = 500;
  let nextTimer = 0;
  const created: Record<string, unknown>[] = [];
  const updated: { id: number; properties: Record<string, unknown> }[] = [];
  const removed: number[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const context = createContext({
    URL,
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    chrome: {
      runtime: { onMessage: { addListener(value: Listener) { listener = value; } } },
      tabs: {
        async create(properties: Record<string, unknown>) { created.push(properties); return { id: nextTab++ }; },
        async update(id: number, properties: Record<string, unknown>) { updated.push({ id, properties }); return { id, ...properties }; },
        async remove(id: number) { removed.push(id); removedListener(id); },
        onRemoved: { addListener(value: (id: number) => void) { removedListener = value; } },
      },
    },
    importScripts() { runInContext(readerSource, context); },
  });
  runInContext(workerSource, context);
  const sender: Sender = { frameId: 0, tab: { id: 7 }, url: `${origin}/musicas` };
  const sourceSender: Sender = { frameId: 0, tab: { id: 500 }, url: sourceUrl };
  function dispatch(type: string, overrides: Record<string, unknown> = {}, from = sender) {
    const replies: unknown[] = [];
    const async = listener({ channel, version: 1, type, requestId, ...overrides }, from, value => replies.push(value));
    return { replies, async };
  }
  return { dispatch, sender, sourceSender, created, updated, removed, timers, context, close: (id: number) => removedListener(id) };
}

async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); }

async function contentReply(type: 'ping' | 'read', workerResponse: unknown) {
  let receive: (event: unknown) => void = () => {};
  const replies: unknown[] = [];
  const browserWindow = {
    top: null as unknown,
    addEventListener(_type: string, listener: (event: unknown) => void) { receive = listener; },
    postMessage(message: unknown) { replies.push(message); },
  };
  browserWindow.top = browserWindow;
  const context = createContext({ window: browserWindow, location: { origin },
    chrome: { runtime: { async sendMessage() { return workerResponse; } } } });
  runInContext(contentSource, context);
  receive({ source: browserWindow, origin, data: { channel, version: 1, type, requestId, sourceUrl } });
  await flush();
  return replies;
}

type FixtureNode = {
  nodeType: number; nodeValue?: string; tagName?: string; childNodes: FixtureNode[];
  textContent: string; isConnected: boolean; hidden: boolean;
  getAttribute: (name: string) => string | null; closest: () => null;
  querySelectorAll: (selector: string) => FixtureNode[];
};

function fixtureNode(tag: string | null, children: FixtureNode[] = [], value = '', attributes: Record<string, string> = {}): FixtureNode {
  const node: FixtureNode = {
    nodeType: tag ? 1 : 3, nodeValue: tag ? undefined : value, tagName: tag?.toUpperCase(),
    childNodes: children, isConnected: true, hidden: false,
    get textContent() { return tag ? node.childNodes.map(child => child.textContent).join('') : value; },
    getAttribute: name => attributes[name] ?? null,
    closest: () => null,
    querySelectorAll: selector => {
      const matches: FixtureNode[] = [];
      const tags = selector.split(',').map(item => item.trim().toUpperCase());
      function visit(candidate: FixtureNode) {
        for (const child of candidate.childNodes) {
          if (child.tagName && tags.includes(child.tagName)) matches.push(child);
          visit(child);
        }
      }
      visit(node);
      return matches;
    },
  };
  return node;
}

function readerForTests() {
  const context = createContext({ URL });
  runInContext(readerSource, context);
  return context.CandeiaCifraReader as {
    readDocument: (document: unknown, selected: string, current: string) => null | {
      sourceUrl: string; title: string; artist: string; text: string; displayedKey?: string;
      soundingKey?: string; capo?: number; keyUnknownReason?: string;
    };
  };
}

describe('extensão Candeia: leitor puro do DOM da cifra', () => {
  it('usa os metadados da música quando o primeiro h2 é Menu principal', () => {
    const pre = fixtureNode('pre', [fixtureNode('b', [fixtureNode(null, [], 'G')]), fixtureNode(null, [], '\nLuz e paz')]);
    const document = {
      defaultView: null, title: 'Cifra',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : []; },
      querySelector(selector: string) {
        if (selector === 'h1') return { textContent: 'Canção - Movimento' };
        if (selector === 'h2') return { textContent: 'Menu principal' };
        if (selector === 'meta[property="og:title"]') return { getAttribute: () => 'Canção - Movimento - Ministério - Equipe - Cifra Club' };
        return null;
      },
    };
    expect(readerForTests().readDocument(document, sourceUrl, sourceUrl)).toMatchObject({ title: 'Canção - Movimento', artist: 'Ministério - Equipe' });
  });
  it('sem artista confiável entrega vazio para usar o artista da busca, nunca o menu', () => {
    const pre = fixtureNode('pre', [fixtureNode('b', [fixtureNode(null, [], 'G')]), fixtureNode(null, [], '\nLuz')]);
    const document = {
      defaultView: null, title: 'Cifra',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : []; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Menu principal' } : null; },
    };
    expect(readerForTests().readDocument(document, sourceUrl, sourceUrl)).toMatchObject({ title: 'Luz', artist: '' });
  });
  it('reconhece cifra só com acordes F7M e Am7M, conserva BR e usa o tom exibido', () => {
    const text = (value: string) => fixtureNode(null, [], value);
    const pre = fixtureNode('pre', [fixtureNode('b', [text('F7M')]), text('    '), fixtureNode('strong', [text('Am7M')]),
      fixtureNode('br'), text('Luz para nós'), fixtureNode('script', [text('ignorar código')])], '', { 'data-original-key': 'C' });
    const current = fixtureNode('span', [text('Tom: F')]);
    const document = {
      defaultView: null, title: 'Luz - Equipe - Cifra Club',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : [current]; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Equipe' } : null; },
    };
    const result = readerForTests().readDocument(document, sourceUrl, sourceUrl);
    expect(result).toEqual({ sourceUrl, title: 'Luz', artist: 'Equipe', text: 'F7M    Am7M\nLuz para nós', displayedKey: 'F' });
    const converted = parseCifraClubText(result!.text).content;
    expect(converted).toContain('[F7M]');
    expect(converted).toContain('[Am7M]');
    expect(stripChords(converted)).toBe('Luz para nós');
  });

  it('não inventa tom a partir de data-original-key nem acordes em uma letra sem marcação', () => {
    const text = (value: string) => fixtureNode(null, [], value);
    const pre = fixtureNode('pre', [fixtureNode('b', [text('C/E')]), text('\nLuz e paz')], '', { 'data-original-key': 'F' });
    const document = {
      defaultView: null, title: 'Luz - Equipe - Cifra Club',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : []; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Equipe' } : null; },
    };
    const reader = readerForTests();
    expect(reader.readDocument(document, sourceUrl, sourceUrl)?.displayedKey).toBeUndefined();
    pre.childNodes = [text('A paz está aqui\nCoração em ti')];
    expect(reader.readDocument(document, sourceUrl, sourceUrl)).toBeNull();
  });

  it('separa o tom que soa do tom escrito quando a fonte usa capotraste', () => {
    const text = (value: string) => fixtureNode(null, [], value);
    const pre = fixtureNode('pre', [fixtureNode('b', [text('G')]), text('\nLuz em paz')], '', { 'data-original-key': 'Bb' });
    const current = fixtureNode('span', [text('Tom: Bb (forma dos acordes no tom de G)')]);
    const capo = fixtureNode('span', [text('Capotraste na 3ª casa')]);
    const document = {
      defaultView: null, title: 'Luz - Equipe - Cifra Club',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : selector.includes('#cifra_capo') ? [capo] : [current]; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Equipe' } : null; },
    };
    const reader = readerForTests();
    expect(reader.readDocument(document, sourceUrl, sourceUrl)).toMatchObject({ displayedKey: 'G', soundingKey: 'Bb', capo: 3 });
    current.childNodes = [text('Tom: Bb')];
    const ambiguous = reader.readDocument(document, sourceUrl, sourceUrl);
    expect(ambiguous?.displayedKey).toBeUndefined();
    expect(ambiguous?.soundingKey).toBe('Bb');
    expect(ambiguous?.keyUnknownReason).toContain('posições');
  });

  it('prefere forma explícita, depois data-current-key, nunca data-original-key', () => {
    const text = (value: string) => fixtureNode(null, [], value);
    const pre = fixtureNode('pre', [fixtureNode('b', [text('G')]), text('\nLuz')]);
    const current = fixtureNode('span', [text('Tom: Bb (forma dos acordes no tom de G)')], '', { 'data-current-key': 'Bb', 'data-original-key': 'F' });
    const document = {
      defaultView: null, title: 'Luz - Equipe - Cifra Club',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : selector.includes('#cifra_capo') ? [] : [current]; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Equipe' } : null; },
    };
    expect(readerForTests().readDocument(document, sourceUrl, sourceUrl)?.displayedKey).toBe('G');
    current.childNodes = [text('Tom: F')];
    expect(readerForTests().readDocument(document, sourceUrl, sourceUrl)?.displayedKey).toBe('Bb');
  });

  it('exclui blocos de tablatura do DOM e preserva os acordes e a letra visíveis', () => {
    const text = (value: string) => fixtureNode(null, [], value);
    const pre = fixtureNode('pre', [fixtureNode('span', [text('E|--0--3---|\nB|--1--0---|')], '', { class: 'tablatura' }),
      fixtureNode('b', [text('G')]), text('\nLuz em paz')]);
    const current = fixtureNode('span', [text('Tom: G')]);
    const document = {
      defaultView: null, title: 'Luz - Equipe - Cifra Club',
      querySelectorAll(selector: string) { return selector === 'pre' ? [pre] : [current]; },
      querySelector(selector: string) { return selector === 'h1' ? { textContent: 'Luz' } : selector === 'h2' ? { textContent: 'Equipe' } : null; },
    };
    expect(readerForTests().readDocument(document, sourceUrl, sourceUrl)?.text).toBe('G\nLuz em paz');
  });
});

describe('extensão Candeia: validação do worker e ciclo de abas próprias', () => {
  it('mantém o manifest limitado aos sites combinados sem permissões adicionais', () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts.flatMap((entry: { matches: string[] }) => entry.matches).sort()).toEqual([
      'https://cifraclub.com.br/*', 'https://louvor-grupo-fxebsy.netlify.app/*', 'https://www.cifraclub.com.br/*',
    ]);
    expect(manifest.content_scripts.every((entry: { all_frames: boolean }) => entry.all_frames === false)).toBe(true);
  });

  it('rejeita remetentes externos, iframes e links que não são músicas HTTPS canônicas', () => {
    const worker = fakeWorker();
    for (const url of ['https://louvor-grupo-fxebsy.netlify.app.evil.test/musicas', 'http://louvor-grupo-fxebsy.netlify.app/musicas']) {
      expect(worker.dispatch('read', { sourceUrl }, { ...worker.sender, url }).replies).toEqual([{ error: 'Esta solicitação não veio de uma aba autorizada do Candeia.' }]);
    }
    expect(worker.dispatch('read', { sourceUrl }, { ...worker.sender, frameId: 1 }).replies).toHaveLength(1);
    for (const url of ['https://www.cifraclub.com.br/login/', 'https://www.cifraclub.com.br.evil.test/equipe/luz/', 'http://www.cifraclub.com.br/equipe/luz/', 'https://user@www.cifraclub.com.br/equipe/luz/', 'https://www.cifraclub.com.br:8443/equipe/luz/']) {
      expect(worker.dispatch('read', { sourceUrl: url }).replies).toEqual([{ error: 'Escolha o link HTTPS de uma música no Cifra Club.' }]);
    }
    expect(worker.created).toHaveLength(0);
  });

  it('o ping confirma o worker ativo somente para uma aba autorizada sem abrir cifras', () => {
    const worker = fakeWorker();
    expect(worker.dispatch('ping').replies).toEqual([{ ok: true, ...importerMetadata }]);
    expect(worker.dispatch('ping', {}, { ...worker.sender, frameId: 1 }).replies).toEqual([{ error: 'Esta solicitação não veio de uma aba autorizada do Candeia.' }]);
    expect(worker.dispatch('ping', { requestId: 'invalid' }).replies).toEqual([{ error: 'Esta solicitação não veio de uma aba autorizada do Candeia.' }]);
    expect(worker.created).toHaveLength(0);
  });

  it('a ponte anuncia suporte ao tom escrito somente se o worker o confirmou', async () => {
    expect(await contentReply('ping', { ok: true, ...importerMetadata })).toEqual([
      { channel, version: 1, type: 'ready', requestId, ...importerMetadata },
    ]);
    expect(await contentReply('ping', { ok: true })).toEqual([
      { channel, version: 1, type: 'ready', requestId },
    ]);
    expect(await contentReply('ping', { ok: false, ...importerMetadata })).toEqual([]);
    const result = { sourceUrl, title: 'Luz', artist: 'Equipe', text: 'G\nLuz', displayedKey: 'G' };
    expect(await contentReply('read', { result, ...importerMetadata })).toEqual([
      { channel, version: 1, type: 'response', requestId, result, ...importerMetadata },
    ]);
  });

  it('autoriza somente a aba criada, retorna texto e tom exibido e fecha apenas essa aba', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl: 'https://cifraclub.com.br/equipe/luz?utm_source=consulta' });
    expect(read.async).toBe(true);
    await flush();
    expect(worker.created).toEqual([{ url: 'about:blank', active: true }]);
    expect(worker.updated[0]).toEqual({ id: 500, properties: { url: sourceUrl, active: true } });
    expect(worker.dispatch('reader-ready', { sourceUrl }, { ...worker.sourceSender, tab: { id: 99 } }).replies).toEqual([{ error: 'Esta aba não pertence a uma consulta ativa.' }]);
    expect(worker.dispatch('reader-ready', { sourceUrl }, worker.sourceSender).replies).toEqual([{ requestId, sourceUrl }]);
    const result = { sourceUrl, title: 'Luz', artist: 'Equipe', text: 'F     C/E\nLuz para nós', displayedKey: 'F' };
    worker.dispatch('reader-result', { sourceUrl, result }, worker.sourceSender);
    await flush();
    expect(read.replies).toEqual([{ result, ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
    expect(worker.updated.at(-1)).toEqual({ id: 7, properties: { active: true } });
    expect(worker.timers.size).toBe(0);
  });

  it('rejeita nova consulta na mesma aba e ignora IDs ou versões da fonte divergentes', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    expect(worker.dispatch('read', { sourceUrl, requestId: alternateId }).replies).toEqual([{ error: 'Uma cifra já está sendo consultada nesta aba. Aguarde ou cancele a consulta.' }]);
    expect(worker.created).toHaveLength(1);
    expect(worker.dispatch('reader-result', { sourceUrl, requestId: alternateId }, worker.sourceSender).replies).toEqual([{ error: 'A consulta já não está ativa.' }]);
    expect(worker.dispatch('reader-result', { sourceUrl: 'https://www.cifraclub.com.br/equipe/outra/' }, worker.sourceSender).replies).toEqual([{ error: 'Esta aba não pertence a uma consulta ativa.' }]);
    expect(read.replies).toHaveLength(0);
    expect(worker.removed).toHaveLength(0);
    worker.dispatch('cancel');
    await flush();
    expect(worker.removed).toEqual([500]);
  });

  it('recusa cifras grandes sem truncar e fecha a aba de consulta', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    worker.dispatch('reader-result', { sourceUrl, result: { sourceUrl, title: 'Luz', artist: 'Equipe', text: 'a'.repeat(100_001) } }, worker.sourceSender);
    await flush();
    expect(read.replies).toEqual([{ error: 'A cifra recebida não tem um conteúdo reconhecido. Nenhum rascunho foi alterado.', ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
  });

  it('conserva metadata de capotraste válida e rejeita posições inválidas', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    const result = { sourceUrl, title: 'Luz', artist: 'Equipe', text: 'G\nLuz', displayedKey: 'G', soundingKey: 'Bb', capo: 3 };
    worker.dispatch('reader-result', { sourceUrl, result }, worker.sourceSender);
    await flush();
    expect(read.replies).toEqual([{ result, ...importerMetadata }]);
    const invalid = worker.dispatch('read', { sourceUrl, requestId: alternateId });
    await flush();
    worker.dispatch('reader-result', { sourceUrl, requestId: alternateId, result: { ...result, capo: 13 } }, { ...worker.sourceSender, tab: { id: 501 } });
    await flush();
    expect(invalid.replies).toEqual([{ error: 'A cifra recebida não tem um conteúdo reconhecido. Nenhum rascunho foi alterado.', ...importerMetadata }]);
  });

  it('cancelamento encerra a leitura, fecha a própria aba e não aceita respostas antigas', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    worker.dispatch('cancel', { requestId: alternateId });
    expect(worker.removed).toHaveLength(0);
    worker.dispatch('cancel');
    await flush();
    expect(read.replies).toEqual([{ error: 'Consulta cancelada.', ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
    expect(worker.dispatch('reader-ready', { sourceUrl }, worker.sourceSender).replies).toEqual([{ error: 'Esta aba não pertence a uma consulta ativa.' }]);
    worker.dispatch('cancel');
    await flush();
    expect(worker.removed).toEqual([500]);
  });

  it('timeout de 25 segundos fecha a consulta e libera a aba solicitante', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    const timer = Array.from(worker.timers.values())[0];
    expect(timer.delay).toBe(25_000);
    timer.callback();
    await flush();
    expect(read.replies).toEqual([{ error: 'A cifra não apareceu em até 25 segundos. Confira se essa versão abre normalmente no seu navegador.', ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
    expect(worker.dispatch('read', { sourceUrl, requestId: alternateId }).async).toBe(true);
    await flush();
    worker.dispatch('cancel', { requestId: alternateId });
    await flush();
  });

  it('fechar a aba do Candeia limpa a consulta sem mover o foco para uma aba ausente', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    worker.close(7);
    await flush();
    expect(read.replies).toEqual([{ error: 'A aba solicitante foi fechada.', ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
    expect(worker.updated).toHaveLength(1);
  });

  it('fecha a consulta e responde com erro quando a fonte informa bloqueio', async () => {
    const worker = fakeWorker();
    const read = worker.dispatch('read', { sourceUrl });
    await flush();
    worker.dispatch('reader-result', { sourceUrl, error: 'O Cifra Club bloqueou a página neste navegador.' }, worker.sourceSender);
    await flush();
    expect(read.replies).toEqual([{ error: 'O Cifra Club bloqueou a página neste navegador.', ...importerMetadata }]);
    expect(worker.removed).toEqual([500]);
  });
});
