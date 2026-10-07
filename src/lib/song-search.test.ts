import { afterEach, describe, expect, it, vi } from 'vitest';
import { cifraClubSearchUrl, cifraClubUrlFromNotes, isSafeCifraClubUrl, mapLyricsResults, notesWithCifraClubSource, previewSongSource, searchSongSources, sourceKey } from './song-search';

afterEach(() => vi.unstubAllGlobals());

describe('busca de fontes de músicas', () => {
  it('abre consulta codificada e aceita somente links HTTPS de músicas do Cifra Club', () => {
    const query = new URL(cifraClubSearchUrl('Canção & paz', 'Equipe / local'));
    expect(query.hostname).toBe('www.cifraclub.com.br');
    expect(query.pathname).toBe('/');
    expect(query.searchParams.get('q')).toBe('Canção & paz Equipe / local');
    expect(isSafeCifraClubUrl('https://www.cifraclub.com.br/equipe/cancao/')).toBe(true);
    for (const unsafe of ['http://www.cifraclub.com.br/equipe/cancao/', 'https://www.cifraclub.com.br.evil.test/equipe/cancao/', 'https://user@www.cifraclub.com.br/equipe/cancao/', 'javascript:alert(1)', 'https://www.cifraclub.com.br/login/']) expect(isSafeCifraClubUrl(unsafe)).toBe(false);
  });

  it('guarda a referência informada sem apagar observações nem duplicar a fonte', () => {
    const url = 'https://www.cifraclub.com.br/equipe/cancao/';
    const notes = notesWithCifraClubSource('Começar suave.', url);
    expect(notes).toBe(`Começar suave.\n\nFonte da cifra: Cifra Club — ${url}`);
    expect(notesWithCifraClubSource(notes, url)).toBe(notes);
    expect(cifraClubUrlFromNotes(notes)).toBe(url);
    expect(notesWithCifraClubSource(notes, '')).toBe('Começar suave.');
    expect(() => notesWithCifraClubSource('Original', 'https://evil.test/cifra/')).toThrow('link HTTPS');
  });
  it('usa a raiz do tom real da fonte e normaliza equivalências sem gerar acordes', () => {
    expect(sourceKey('C#m')).toBe('Db');
    expect(sourceKey('Gb')).toBe('F#');
    expect(sourceKey('D')).toBe('D');
    expect(sourceKey('desconhecido')).toBeNull();
  });
  it('remove timestamps, ignora instrumentais e deduplica letras sem inventar acordes', () => {
    const track = { id: 1, trackName: 'Canção original', artistName: 'Equipe local', syncedLyrics: '[00:01.20]Uma linha\n[00:02.00]Outra linha' };
    const songs = mapLyricsResults([track, { ...track, id: 2 }, { ...track, id: 3, instrumental: true }, { id: 4, trackName: 'Sem letra', artistName: 'Equipe local' }]);
    expect(songs).toHaveLength(1);
    expect(songs[0].content).toBe('Uma linha\nOutra linha');
    expect(songs[0].originalKey).toBeUndefined();
    expect(songs[0].sourceUrl).toBe('https://lrclib.net/api/get/1');
  });

  it('envia título e artista corretamente codificados ao endpoint público', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await searchSongSources('Canção & paz', 'Equipe / local', 'lyrics');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.origin).toBe('https://lrclib.net');
    expect(url.searchParams.get('track_name')).toBe('Canção & paz');
    expect(url.searchParams.get('artist_name')).toBe('Equipe / local');
  });

  it('explica indisponibilidade da função e preserva erros reais da fonte', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(searchSongSources('Canção', '', 'chords')).rejects.toThrow('função de consulta publicada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Fonte indisponível.' }), { status: 502 })));
    await expect(previewSongSource({ id: '1', title: 'Canção', artist: '', kind: 'chords', source: 'Worship Together', sourceUrl: 'https://www.worshiptogether.com/pt/cancoes/cancao/' })).rejects.toThrow('Fonte indisponível.');
  });
});
