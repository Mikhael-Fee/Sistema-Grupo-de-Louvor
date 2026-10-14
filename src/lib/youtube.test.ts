import { afterEach, describe, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./backend', () => ({ supabase: { auth: session } }));
import { buildYouTubeSearchUrl, getYouTubeVideoId, normalizeYouTubeUrl, searchYouTubeVideos, youtubeThumbnailUrl } from './youtube';
import { isSafeYoutubeUrl } from './validation';

afterEach(() => { vi.unstubAllGlobals(); session.getSession.mockReset(); });
const id = 'AbCdEfG_123';
const accepted = [`https://www.youtube.com/watch?v=${id}&t=20`, `https://youtu.be/${id}?si=share`, `https://www.youtu.be/${id}/`, `https://m.youtube.com/watch?v=${id}`, `https://youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/live/${id}/`, `https://www.youtube.com/watch?t=20&v=${id}`];
const denied = ['javascript:alert(1)', `http://youtube.com/watch?v=${id}`, `https://youtube.com.evil.test/watch?v=${id}`, `https://youtube.com@evil.test/watch?v=${id}`, `https://user:password@youtube.com/watch?v=${id}`, 'https://youtu.be/', 'https://youtube.com/watch?v=short', 'https://youtube.com/playlist?list=PLtest', `https://youtube.com:8443/watch?v=${id}`, 'https://vimeo.com/123456789', `https://youtube.com/watch?v=short&v=${id}`];

describe('vídeos do YouTube sem URLs arbitrárias', () => {
  it('normaliza a mesma matriz de URLs HTTPS autorizada pelo cadastro', () => {
    for (const url of accepted) { expect(isSafeYoutubeUrl(url), url).toBe(true); expect(getYouTubeVideoId(url), url).toBe(id); expect(normalizeYouTubeUrl(url)).toBe(`https://www.youtube.com/watch?v=${id}`); }
    for (const url of denied) { expect(isSafeYoutubeUrl(url), url).toBe(false); expect(getYouTubeVideoId(url), url).toBeNull(); expect(normalizeYouTubeUrl(url)).toBeNull(); }
  });
  it('monta apenas capas fixas a partir de IDs validados e limita tamanho', () => {
    expect(youtubeThumbnailUrl(id)).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    expect(youtubeThumbnailUrl(accepted[0])).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    for (const value of ['../private', 'https://evil.test/image.png', `https://youtu.be/${id}?data=${'a'.repeat(2000)}`, '', 'https://youtube.com/channel/test']) expect(youtubeThumbnailUrl(value)).toBeNull();
    expect(getYouTubeVideoId(undefined)).toBeNull();
  });
  it('codifica título e artista para abrir uma busca de texto, sem redirecionamentos', () => {
    const url = new URL(buildYouTubeSearchUrl(' Luz & paz ', ' Equipe local '));
    expect(url.origin).toBe('https://www.youtube.com'); expect(url.pathname).toBe('/results'); expect(url.searchParams.get('search_query')).toBe('Luz & paz Equipe local');
  });
  it('não consulta o endpoint sem sessão e exige título', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); session.getSession.mockResolvedValue({ data: { session: null } });
    await expect(searchYouTubeVideos('a', '')).rejects.toThrow('dois caracteres');
    await expect(searchYouTubeVideos('Luz', '')).rejects.toThrow('Entre novamente'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('envia sessão no header e rejeita respostas com IDs ou links falsos', async () => {
    session.getSession.mockResolvedValue({ data: { session: { access_token: 'local.test.signature' } } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id, title: 'Luz da equipe', channel: 'Equipe local', url: `https://youtu.be/${id}`, thumbnailUrl: 'https://evil.test/img' },
      { id, title: 'Duplicado', url: `https://youtu.be/${id}` }, { id: 'short', title: 'Inválido', url: 'https://youtu.be/short' },
      { id: 'BcDeFgH_456', title: 'Host falso', url: `https://youtube.com.evil.test/watch?v=BcDeFgH_456` },
    ] }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
    const response = await searchYouTubeVideos('Luz & paz', 'Equipe local');
    expect(response.results).toEqual([{ id, title: 'Luz da equipe', channel: 'Equipe local', url: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }]);
    const [url, options] = fetcher.mock.calls[0]; expect(new URL(url, 'https://local.test').searchParams.get('title')).toBe('Luz & paz');
    expect(String(url)).not.toContain('signature'); expect(options.headers.Authorization).toBe('Bearer local.test.signature');
  });
  it('expõe bloqueio da fonte e respeita cancelamento antes do fetch', async () => {
    session.getSession.mockResolvedValue({ data: { session: { access_token: 'local.test.signature' } } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Fonte indisponível' }), { status: 502 })); vi.stubGlobal('fetch', fetcher);
    await expect(searchYouTubeVideos('Luz', '')).rejects.toThrow('Fonte indisponível');
    const controller = new AbortController(); controller.abort(new Error('Cancelado'));
    await expect(searchYouTubeVideos('Luz', '', controller.signal)).rejects.toThrow('Cancelado'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
