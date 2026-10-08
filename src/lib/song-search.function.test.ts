import { afterEach, describe, expect, it, vi } from 'vitest';
const functionModulePath = '../../netlify/functions/song-search.mjs';
const { allowedSongUrl, cleanChordSheet: cleanServerChordSheet, convertCifraClubRows, handler, parseCifraClubPage, parseCifraClubSearch, parseSongPage } = await import(functionModulePath);
import { cleanChordSheet } from './cifraclub';
afterEach(() => vi.unstubAllGlobals());

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

describe('Cifra Club público', () => {
  it('seleciona versões com acordes e retorna metadata, sem copiar a letra da busca', () => {
    const song = { t: '2', txt: 'Canção da equipe', art: 'Equipe local', dns: 'equipe-local', url: 'cancao-da-equipe', vci: 2, block: 0, letra: 'Texto do índice não importado' };
    const results = parseCifraClubSearch(`suggest_callback(${JSON.stringify({ response: { docs: [song, song, { ...song, url: 'outra', block: 1 }, { ...song, url: 'sem-cifra', vci: 0 }, { ...song, dns: '../private' }] } })})`);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: 'https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/', title: 'Canção da equipe', artist: 'Equipe local', source: 'Cifra Club', sourceUrl: 'https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/', kind: 'chords' });
    expect(() => parseCifraClubSearch('unknown_callback({});alert(1)')).toThrow();
  });

  it('consulta somente o autocomplete público com uma consulta de texto limitada', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('suggest_callback({"response":{"docs":[]}})', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await handler({ httpMethod: 'GET', queryStringParameters: { source: 'cifraclub', title: 'Canção & paz', artist: 'Equipe local' } });
    expect(response.statusCode).toBe(200);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.origin).toBe('https://solr.sscdn.co');
    expect(url.pathname).toBe('/cc/select/');
    expect(url.searchParams.get('q')).toBe('cancao paz equipe local');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });

  it('lê apenas a cifra pública, preservando acordes alinhados, seções e metadata', () => {
    const html = '<h1 class="t1">Canção da equipe</h1><h2 class="t3"><a href="/equipe-local/">Equipe local</a></h2><span id="cifra_tom">Tom: <a href="#">Bb</a></span><div class="cifra_cnt"><pre>[Intro] <b>Bb</b> <b>F/A</b>\n\n<b>Bb</b>      <b>F/A</b>\nA luz nos guia\n<b>Gm7</b>       <b>Eb9</b>\nSeguimos em paz</pre></div>';
    const song = parseCifraClubPage(html, 'https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/?v=1');
    expect(song.title).toBe('Canção da equipe');
    expect(song.artist).toBe('Equipe local');
    expect(song.originalKey).toBe('Bb');
    expect(song.content).toBe('[Intro] [Bb] [F/A]\n\n[Bb]A luz no[F/A]s guia\n[Gm7]Seguimos e[Eb9]m paz');
    expect(song.sourceUrl).toBe('https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/');
    expect(song.source).toBe('Cifra Club');
  });

  it('não inventa cifras nem tom e recusa URLs fora de páginas públicas', () => {
    const html = '<h1>Canção</h1><h2>Equipe</h2><pre><b>C</b>\nNossa luz</pre>';
    expect(parseCifraClubPage(html, 'https://www.cifraclub.com.br/equipe/cancao/').originalKey).toBeUndefined();
    expect(() => parseCifraClubPage('<h1>Canção</h1><h2>Equipe</h2><p>Sem acordes</p>', 'https://www.cifraclub.com.br/equipe/cancao/')).toThrow('cifra pública reconhecida');
    for (const unsafe of ['https://www.cifraclub.com.br/login/', 'https://user@www.cifraclub.com.br/equipe/cancao/', 'https://www.cifraclub.com.br.evil.test/equipe/cancao/', 'http://www.cifraclub.com.br/equipe/cancao/', 'https://www.cifraclub.com.br:8443/equipe/cancao/']) expect(allowedSongUrl(unsafe)).toBeNull();
  });

  it('preserva acordes malformados extensos sem executar regex exponencial', () => {
    const invalid = `C${'1'.repeat(26)}x`;
    expect(convertCifraClubRows(`${invalid}\nNossa luz`)).toBe(`${invalid}\nNossa luz`);
    expect(() => convertCifraClubRows('C'.repeat(100_001))).toThrow('limite de tamanho');
  });

  it('limpa tablaturas e diagramas do servidor com as mesmas regras do editor', () => {
    const raw = 'Afinação: E A D G B E\nCapotraste na 3ª casa\n[Intro] G D/F#\n\nTablatura\nE|----0----|\nB|----1----|\n\nDiagramas dos acordes\nE A D G B E\nC x32010\nG: 320003\nDm x x 0 2 3 1\n\n[Refrão]\nG\nA luz vem';
    expect(cleanServerChordSheet(raw)).toBe(cleanChordSheet(raw));
    expect(convertCifraClubRows(raw)).not.toMatch(/Afinação|Capotraste|\|----|x32010/);
    expect(convertCifraClubRows(raw)).toContain('[Intro] [G] [D/F#]');
    expect(convertCifraClubRows(raw)).toContain('[G]A luz vem');
  });

  it('retorna o tom das posições escritas e separa o som com capotraste', () => {
    const prefix = '<h1>Luz</h1><h2>Equipe</h2><span id="cifra_tom">Tom: Bb (forma dos acordes no tom de G)</span><div id="cifra_capo">Capotraste na 3ª casa</div>';
    const html = `${prefix}<pre data-original-key="Bb"><b>G</b>\nLuz\nE|---0---|\nB|---1---|</pre>`;
    const result = parseCifraClubPage(html, 'https://www.cifraclub.com.br/equipe/luz/');
    expect(result).toMatchObject({ originalKey: 'G', soundingKey: 'Bb', capo: 3, content: '[G]Luz' });
    const ambiguous = parseCifraClubPage(html.replace(' (forma dos acordes no tom de G)', ''), 'https://www.cifraclub.com.br/equipe/luz/');
    expect(ambiguous.originalKey).toBeUndefined();
    expect(ambiguous.keyUnknownReason).toContain('posições');
    expect(ambiguous.soundingKey).toBe('Bb');
  });

  it('informa um bloqueio da fonte e não segue redirecionamentos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Access denied', { status: 403 })));
    const response = await handler({ httpMethod: 'GET', queryStringParameters: { url: 'https://www.cifraclub.com.br/equipe/cancao/' } });
    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).error).toContain('O Cifra Club bloqueou a consulta automática');
  });
});
