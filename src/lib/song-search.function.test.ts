import { describe, expect, it } from 'vitest';
const functionModulePath = '../../netlify/functions/song-search.mjs';
const { allowedSongUrl, handler, parseSongPage } = await import(functionModulePath);

describe('consulta restrita à fonte pública de cifras', () => {
  it('encontra títulos com pequenas diferenças no endereço oficial e limita resultados', async () => {
    const response = await handler({ httpMethod: 'GET', queryStringParameters: { title: 'Quão lindo esse nome é', artist: 'Hillsong' } });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].sourceUrl).toBe('https://www.worshiptogether.com/pt/cancoes/quao-lindo-sse-nome-e-hillsong/');
    const broad = JSON.parse((await handler({ httpMethod: 'GET', queryStringParameters: { title: 'santo' } })).body);
    expect(broad.results.length).toBeLessThanOrEqual(5);
  });
  it('rejeita origens, credenciais, caminhos e protocolos fora da fonte', () => {
    for (const value of ['http://www.worshiptogether.com/songs/test/', 'https://evil.example/songs/test/', 'https://www.worshiptogether.com.evil.example/songs/test/', 'https://user@www.worshiptogether.com/songs/test/', 'https://www.worshiptogether.com/membership/account/', 'https://www.worshiptogether.com/songs/../membership/test/']) expect(allowedSongUrl(value)).toBeNull();
    expect(allowedSongUrl('https://www.worshiptogether.com/pt/cancoes/cancao-local/?nav=1')).toBe('https://www.worshiptogether.com/pt/cancoes/cancao-local/');
  });

  it('extrai somente letra e acordes presentes na cifra, com metadata e fonte', () => {
    const html = '<meta property="og:title" content="Can&#xE7;&#xE3;o - Equipe local | Worship Together"><h1 class="t-song-details__marquee__headline">Can&#xE7;&#xE3;o</h1><div id="chordPro" data-original-key="D"><div class="chord-pro-line"><div class="chord-pro-segment"><div class="chord-pro-note">D&nbsp;</div><div class="chord-pro-lyric">Luz </div></div><div class="chord-pro-segment"><div class="chord-pro-note">A/C#&nbsp;</div><div class="chord-pro-lyric">e paz</div></div></div><div class="chord-pro-line"><div class="chord-pro-segment"><div class="chord-pro-note">&nbsp;</div><div class="chord-pro-lyric">Caminhamos</div></div></div></div>';
    const song = parseSongPage(html, 'https://www.worshiptogether.com/pt/cancoes/cancao/');
    expect(song.title).toBe('Canção');
    expect(song.artist).toBe('Equipe local');
    expect(song.originalKey).toBe('D');
    expect(song.content).toBe('[D]Luz [A/C#]e paz\nCaminhamos');
    expect(song.source).toBe('Worship Together');
  });

  it('não tenta consultar URLs não autorizadas nem aceitar métodos de escrita', async () => {
    expect((await handler({ httpMethod: 'GET', queryStringParameters: { url: 'https://127.0.0.1/private' } })).statusCode).toBe(400);
    expect((await handler({ httpMethod: 'POST', queryStringParameters: {} })).statusCode).toBe(405);
    expect(() => parseSongPage('<h1>Conteúdo protegido</h1>', 'https://www.worshiptogether.com/songs/test/')).toThrow('cifra pública reconhecida');
  });
});
