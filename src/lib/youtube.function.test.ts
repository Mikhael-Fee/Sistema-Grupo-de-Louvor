import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const functionModulePath = '../../netlify/functions/youtube-search.mjs';
let api: Awaited<ReturnType<typeof importFunction>>;
async function importFunction() { return await import(functionModulePath); }
const USER = '20000000-0000-4000-8000-000000000001';
const ID = 'AbCdEfG_123';
const renderer = (id = ID, title = 'Canção da equipe') => ({ videoRenderer: { videoId: id, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: 'Equipe local' }] } } });
const data = (...rows: unknown[]) => ({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: rows } }] } } } } });
const event = (title = 'Canção local') => ({ httpMethod: 'GET', headers: { authorization: 'Bearer local.test.signature' }, queryStringParameters: { title, artist: 'Equipe local' } });
const authResponse = () => new Response(JSON.stringify({ id: USER }), { status: 200 });
const profileResponse = (approved = true) => new Response(JSON.stringify([{ id: USER, approved }]), { status: 200 });
beforeEach(async () => {
  vi.resetModules(); vi.stubEnv('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co'); vi.stubEnv('SUPABASE_ANON_KEY', 'public-test-key'); vi.stubEnv('YOUTUBE_API_KEY', '');
  api = await importFunction();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('busca autenticada e limitada de metadados públicos YouTube', () => {
  it('extrai JSON da página sem executar scripts e conserva ordem dos resultados', () => {
    const source = data(renderer(ID, 'Luz " { da equipe'), renderer('BcDeFgH_456'), renderer(ID), renderer('short'), { playlistRenderer: { playlistId: 'PL123' } });
    const html = `<script>var ytInitialData = ${JSON.stringify(source)}; window.shouldNotRun=true;</script>`;
    expect(api.parseYouTubeHtml(html)).toEqual([
      { id: ID, title: 'Luz " { da equipe', channel: 'Equipe local', url: `https://www.youtube.com/watch?v=${ID}`, thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg` },
      { id: 'BcDeFgH_456', title: 'Canção da equipe', channel: 'Equipe local', url: 'https://www.youtube.com/watch?v=BcDeFgH_456', thumbnailUrl: 'https://i.ytimg.com/vi/BcDeFgH_456/hqdefault.jpg' },
    ]);
    expect((globalThis as Record<string, unknown>).shouldNotRun).toBeUndefined();
  });
  it('rejeita consentimento, JSON malformado e texto acima do limite', () => {
    expect(() => api.parseYouTubeHtml('<h1>Consent</h1>')).toThrow();
    expect(() => api.parseYouTubeHtml('var ytInitialData = {"contents":')).toThrow();
    expect(() => api.parseYouTubeHtml('x'.repeat(3_000_001))).toThrow('source-size');
    expect(api.parseYouTubeData(data(...Array.from({ length: 20 }, (_, index) => renderer(`AbCdEfG_${String(index).padStart(3, '0')}`))))).toHaveLength(6);
  });
  it('recusa método, ausência de sessão e título inválido antes de qualquer transporte', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await api.handler({ ...event(), httpMethod: 'POST' })).statusCode).toBe(405);
    expect((await api.handler({ ...event(), headers: {} })).statusCode).toBe(401);
    expect((await api.handler(event('a'))).statusCode).toBe(400);
    expect((await api.handler(event('a'.repeat(201)))).statusCode).toBe(400);
    expect((await api.handler(event('Canção\nlocal'))).statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('não permite URL Supabase arbitrária nem consulta externa com configuração ausente', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); vi.stubEnv('SUPABASE_URL', 'https://127.0.0.1/private');
    expect((await api.handler(event())).statusCode).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it('não busca vídeos para conta inválida ou aguardando aprovação', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(authResponse()).mockResolvedValueOnce(profileResponse(false)); vi.stubGlobal('fetch', fetcher);
    expect((await api.handler(event())).statusCode).toBe(401); expect((await api.handler(event())).statusCode).toBe(403);
    expect(fetcher.mock.calls.every(([url]) => new URL(url).hostname === 'abcdefghijklmnopqrst.supabase.co')).toBe(true);
  });
  it('revalida aprovação mesmo em cache e faz apenas busca fixa codificada do YouTube', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/v1/user')) return authResponse();
      if (url.includes('/rest/v1/profiles')) return profileResponse();
      return new Response(`<script>var ytInitialData=${JSON.stringify(data(renderer()))};</script>`, { status: 200 });
    }); vi.stubGlobal('fetch', fetcher);
    const first = await api.handler(event('Luz & paz')); const second = await api.handler(event('Luz & paz'));
    expect(first.statusCode).toBe(200); expect(second.body).toBe(first.body);
    const videos = fetcher.mock.calls.filter(([url]) => new URL(url).hostname === 'www.youtube.com'); expect(videos).toHaveLength(1);
    const url = new URL(videos[0][0]); expect(url.pathname).toBe('/results'); expect(url.searchParams.get('search_query')).toBe('Luz & paz Equipe local');
    expect(videos[0][1].redirect).toBe('error'); expect(videos[0][1].headers.Authorization).toBeUndefined();
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/auth/v1/user'))).toHaveLength(2);
  });
  it('informa bloqueio e não segue redirects ou renderiza sugestões fictícias', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(authResponse()).mockResolvedValueOnce(profileResponse()).mockResolvedValueOnce(new Response('Blocked', { status: 403 })); vi.stubGlobal('fetch', fetcher);
    const response = await api.handler(event()); expect(response.statusCode).toBe(502); expect(JSON.parse(response.body).results).toBeUndefined(); expect(JSON.parse(response.body).error).toContain('Abra a busca no YouTube');
    expect(fetcher.mock.calls[2][1].redirect).toBe('error');
  });
  it('limita resposta upstream antes de ler corpo enorme', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(authResponse()).mockResolvedValueOnce(profileResponse()).mockResolvedValueOnce(new Response('small', { status: 200, headers: { 'content-length': '3000001' } })); vi.stubGlobal('fetch', fetcher);
    expect((await api.handler(event())).statusCode).toBe(502);
  });
  it('limita consultas por conta e nunca guarda token na chave da busca', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => url.includes('/auth/v1/user') ? authResponse() : url.includes('/rest/v1/profiles') ? profileResponse() : new Response(`<script>var ytInitialData=${JSON.stringify(data(renderer()))};</script>`)); vi.stubGlobal('fetch', fetcher);
    for (let index = 0; index < 15; index++) expect((await api.handler(event())).statusCode).toBe(200);
    expect((await api.handler(event())).statusCode).toBe(429);
    expect(fetcher.mock.calls.filter(([url]) => new URL(url).hostname === 'www.youtube.com')).toHaveLength(1);
    expect(fetcher.mock.calls.every(([url]) => !url.includes('signature'))).toBe(true);
  });
});
