// Read only public song pages. No authentication, protected charts, or arbitrary proxy URLs.
const SOURCE_ORIGIN = 'https://www.worshiptogether.com';
const CIFRA_ORIGIN = 'https://www.cifraclub.com.br';
const CIFRA_SEARCH = 'https://solr.sscdn.co/cc/select/';
const MAX_SOURCE_BYTES = 2_000_000;
// Public catalog URLs verified from sitemap-pt.xml on 2026-10-06; no song content is bundled.
const PUBLIC_CATALOG_URLS = [
  "https://www.worshiptogether.com/pt/cancoes/isso-e-que-e-viver-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/santo-espirito-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/louvai-o-nome-anastasis-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/so-a-ti-eu-louvarei-united/",
  "https://www.worshiptogether.com/pt/cancoes/rei-do-meu-coracao-john-mark-mcmillan/",
  "https://www.worshiptogether.com/pt/cancoes/acende-um-fogo-united-pursuit/",
  "https://www.worshiptogether.com/pt/cancoes/cadeias-quebrar/",
  "https://www.worshiptogether.com/pt/cancoes/bom-bom-pai-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/leao-e-o-cordeiro/",
  "https://www.worshiptogether.com/pt/cancoes/amor-eterno-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/ceus-abertos-como-um-rio/",
  "https://www.worshiptogether.com/pt/cancoes/transfiguracao-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/noite-feliz-christine-dclario/",
  "https://www.worshiptogether.com/pt/cancoes/encontrei-meu-lugar-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/feroz-jesus-culture/",
  "https://www.worshiptogether.com/pt/cancoes/o-teu-amor-e-tao-real-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/pra-sempre-cantarei-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/de-graca-em-graca-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/porque-ele-vive-amen/",
  "https://www.worshiptogether.com/pt/cancoes/quao-lindo-sse-nome-e-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/veja-canta-minhalma-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/teu-grande-amor-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/que-haja-luz-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/assim-como-e-no-ceu-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/sim-e-amen-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/tu-es-digno-passion/",
  "https://www.worshiptogether.com/pt/cancoes/eu-vou-construir-pat-barrett/",
  "https://www.worshiptogether.com/pt/cancoes/glorioso-dia-passion/",
  "https://www.worshiptogether.com/pt/cancoes/santo-lugar-passion/",
  "https://www.worshiptogether.com/pt/cancoes/eu-tambem-100-bilhoes-x-united/",
  "https://www.worshiptogether.com/pt/cancoes/fara-outra-vez-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/liberdade-jesus-culture/",
  "https://www.worshiptogether.com/pt/cancoes/estacoes-dunamis/",
  "https://www.worshiptogether.com/pt/cancoes/quem-dizes-que-eu-sou-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/bendizei-ao-senhor-matt-redman/",
  "https://www.worshiptogether.com/pt/cancoes/vivo-estas-hillsong-young-free/",
  "https://www.worshiptogether.com/pt/cancoes/perfeita-gracia/",
  "https://www.worshiptogether.com/pt/cancoes/sim-na-cruz/",
  "https://www.worshiptogether.com/pt/cancoes/meu-lindo-jesus-tim-highes/",
  "https://www.worshiptogether.com/pt/cancoes/porque-ele-vive/",
  "https://www.worshiptogether.com/pt/cancoes/mergulho-nas-aguas/",
  "https://www.worshiptogether.com/pt/cancoes/eu-te-bendirei-matt-redman/",
  "https://www.worshiptogether.com/pt/cancoes/vasos-quebrados-sublime-graca-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/teu-reino-aqui/",
  "https://www.worshiptogether.com/pt/cancoes/vida-achei-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/a-paixao-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/em-paz-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/me-lembrarei-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/teu-toque-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/vinho-novo-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/meu-tudo-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/a-mihna-fe-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/me-entrego-hillsong-young-free/",
  "https://www.worshiptogether.com/pt/cancoes/teu-coracao-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/pra-sempre-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/pra-sempre-ao-vivo-kari-jobe/",
  "https://www.worshiptogether.com/pt/cancoes/grandes-coisas-phil-wickham/",
  "https://www.worshiptogether.com/pt/cancoes/dia-feliz/",
  "https://www.worshiptogether.com/pt/cancoes/do-ceu-desceu-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/vim-para-adorar-te/",
  "https://www.worshiptogether.com/pt/cancoes/existe-alguem-digno-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/santo-e-o-senhor-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/hosana-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/profundo-amor-do-pai-por-nos/",
  "https://www.worshiptogether.com/pt/cancoes/quao-grande-e-o-meu-deus/",
  "https://www.worshiptogether.com/pt/cancoes/grandioso-es-tu/",
  "https://www.worshiptogether.com/pt/cancoes/eu-me-rendo-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/so-em-jesus/",
  "https://www.worshiptogether.com/pt/cancoes/tu-es-tremendo-deus-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/boa-graca-united/",
  "https://www.worshiptogether.com/pt/cancoes/outro-na-fornalha-united/",
  "https://www.worshiptogether.com/pt/cancoes/nada-mais-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/me-rendo-a-ti-passion/",
  "https://www.worshiptogether.com/pt/cancoes/leve-me-a-cruz-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/salvou-meu-coracao-me-abracou-united/",
  "https://www.worshiptogether.com/pt/cancoes/senhor-preciso-de-ti/",
  "https://www.worshiptogether.com/pt/cancoes/cordeiro-que-sofreu-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/poder-pra-salvar-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/nao-ha-um-nome-igual-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/oceanos-onde-meus-pes-podem-falhar-hillsong-united/",
  "https://www.worshiptogether.com/pt/cancoes/o-senhor-tu-es-lindo-keith-green/",
  "https://www.worshiptogether.com/pt/cancoes/nosso-deus-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/pronto-ou-nao-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/eu-corro-ao-pai-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/profundo-amor-hillsong-young-free/",
  "https://www.worshiptogether.com/pt/cancoes/espirito-vem/",
  "https://www.worshiptogether.com/pt/cancoes/te-agradeco-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/essencia-da-adoracao-passion/",
  "https://www.worshiptogether.com/pt/cancoes/isto-eu-creio-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/despertar-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/nos-prostamos-passion/",
  "https://www.worshiptogether.com/pt/cancoes/rei-dos-reis-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/a-quem-temerei-deus-que-e-poderoso-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/nunca-me-deixou-passion/",
  "https://www.worshiptogether.com/pt/cancoes/teu-amor-nao-falha-jesus-culture/",
  "https://www.worshiptogether.com/pt/cancoes/agua-santa-we-the-kingdom/",
  "https://www.worshiptogether.com/pt/cancoes/bondade-de-deus-bethel/",
  "https://www.worshiptogether.com/pt/cancoes/hosanna-casa-worship/",
  "https://www.worshiptogether.com/pt/cancoes/a-vitoria-posso-ver-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/desperta-minh-alma-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/deus-tanto-amou-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/nada-e-impossi-vel-para-deus-passion/",
  "https://www.worshiptogether.com/pt/cancoes/exaltado-es-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/minhas-guerras-guardado/",
  "https://www.worshiptogether.com/pt/cancoes/a-bencao-worship-together/",
  "https://www.worshiptogether.com/pt/cancoes/avivamento-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/sinais-josh-baldwin/",
  "https://www.worshiptogether.com/pt/cancoes/como-eu-sou-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/algo-novo-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/tudo-vai-ficar-bem-evan-craft/",
  "https://www.worshiptogether.com/pt/cancoes/teu-espiritu-kim-walker-smith-ft-gabriela-rocha/",
  "https://www.worshiptogether.com/pt/cancoes/teu-espirito-your-spirit-kim-walker-smith-ft-gabriela-rocha/",
  "https://www.worshiptogether.com/pt/cancoes/gratidao-brandon-lake/",
  "https://www.worshiptogether.com/pt/cancoes/vento-novo-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/eu-teu-amor-josh-baldwin/",
  "https://www.worshiptogether.com/pt/cancoes/temos-vitoria-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/bom-demais-para-nao-crer-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/jesus-sobre-tudo-esta-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/canto-aos-montes-chris-mcclarney/",
  "https://www.worshiptogether.com/pt/cancoes/meu-jesus-anne-wilson/",
  "https://www.worshiptogether.com/pt/cancoes/ele-nos-ama-crowder/",
  "https://www.worshiptogether.com/pt/cancoes/em-seu-nome-lakewood-music/",
  "https://www.worshiptogether.com/pt/cancoes/cancao-dos-ceus-bethel-music/",
  "https://www.worshiptogether.com/pt/cancoes/sei-que-faras-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/mil-nomes-sean-curran/",
  "https://www.worshiptogether.com/pt/cancoes/vem-sobre-nos-upperroom/",
  "https://www.worshiptogether.com/pt/cancoes/quero-jesus-upperroom/",
  "https://www.worshiptogether.com/pt/cancoes/vem-espirito-patrick-mayberry/",
  "https://www.worshiptogether.com/pt/cancoes/sozinho-nunca-andarei-hillsong/",
  "https://www.worshiptogether.com/pt/cancoes/ha-poder-hillsong-em-portugues/",
  "https://www.worshiptogether.com/pt/cancoes/nos-rendemos-de-novo-hillsong-worship/",
  "https://www.worshiptogether.com/pt/cancoes/outro-igual-na-o-ha-upperroom/",
  "https://www.worshiptogether.com/pt/cancoes/o-tempo-e-teu-kim-walker-smith/",
  "https://www.worshiptogether.com/pt/cancoes/firme-fundamento-jamais-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/pelo-que-fez-passion/",
  "https://www.worshiptogether.com/pt/cancoes/milhares-de-aleluias-brooke-ligertwood/",
  "https://www.worshiptogether.com/pt/cancoes/melhor-do-que-pensei-bryan-katie-torwalt/",
  "https://www.worshiptogether.com/pt/cancoes/o-mesmo-deus-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/em-nome-de-jesus-katy-nichole/",
  "https://www.worshiptogether.com/pt/cancoes/o-melhor-esta-por-vir-mack-brock-ft-pat-barrett/",
  "https://www.worshiptogether.com/pt/cancoes/por-jesus-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/o-que-vejo-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/lindo-jesus-passion/",
  "https://www.worshiptogether.com/pt/cancoes/tudo-esta-mudando-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/sempre-yhwh-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/sempre-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/nao-ha-ninguem-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/cristo-jesus-crucificado-lindy-cofer/",
  "https://www.worshiptogether.com/pt/cancoes/tens-meu-olhar-taya/",
  "https://www.worshiptogether.com/pt/cancoes/levar-pra-jesus-anna-golden/",
  "https://www.worshiptogether.com/pt/cancoes/discernimento-bryan-katie-torwalt/",
  "https://www.worshiptogether.com/pt/cancoes/toma-o-teu-lugar-gas-street-music/",
  "https://www.worshiptogether.com/pt/cancoes/como-nos-te-amamos-maverick-city-musica-andre-aquino/",
  "https://www.worshiptogether.com/pt/cancoes/santo-pra-sempre-chris-tomlin/",
  "https://www.worshiptogether.com/pt/cancoes/ha-vida-em-ti-jonathan-traylor/",
  "https://www.worshiptogether.com/pt/cancoes/e-dizemos-amem-lakewood-music/",
  "https://www.worshiptogether.com/pt/cancoes/bom-esse-e-quem-tu-e-s-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/eu-sou-livre-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/eu-creio-em-ti-senhor-cody-carnes/",
  "https://www.worshiptogether.com/pt/cancoes/guerreiro-do-ceu-tasha-cobbs-leonard/",
  "https://www.worshiptogether.com/pt/cancoes/santo-tasha-cobbs-leonard/",
  "https://www.worshiptogether.com/pt/cancoes/so-em-jesus-housefires/",
  "https://www.worshiptogether.com/pt/cancoes/a-pomba-the-belonging-co-kari-jobe/",
  "https://www.worshiptogether.com/pt/cancoes/esta-ressuscitou-hannah-hobbs/",
  "https://www.worshiptogether.com/pt/cancoes/eu-teria-tanto-pra-contar-housefires/",
  "https://www.worshiptogether.com/pt/cancoes/sou-grato-housefires/",
  "https://www.worshiptogether.com/pt/cancoes/eu-olho-pra-ti-housefires/",
  "https://www.worshiptogether.com/pt/cancoes/eu-provei-passion/",
  "https://www.worshiptogether.com/pt/cancoes/cancao-do-ceu-ao-vivo-gabriela-rocha-jessica-augusto/",
  "https://www.worshiptogether.com/pt/cancoes/vem-fluir-passion/",
  "https://www.worshiptogether.com/pt/cancoes/cordeiro-de-deus-jesus-culture/",
  "https://www.worshiptogether.com/pt/cancoes/eu-creio-evan-craft/",
  "https://www.worshiptogether.com/pt/cancoes/quem-mais-e-digno-gabriel-guedes/",
  "https://www.worshiptogether.com/pt/cancoes/cristo-a-razao-do-nosso-ser-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/minhas-coroas-gateway-worship/",
  "https://www.worshiptogether.com/pt/cancoes/mais-de-ti-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/veja-o-que-o-senhor-ja-fez-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/bencaos-que-nao-tem-fim-seph-schlueter/",
  "https://www.worshiptogether.com/pt/cancoes/mais-uma-vez-elevation-worship/",
  "https://www.worshiptogether.com/pt/cancoes/outro-igual-nao-ha-ao-rei-nos-coroamos-gabriel-guedes/",
  "https://www.worshiptogether.com/pt/cancoes/poderoso-nome-the-belonging-co/",
  "https://www.worshiptogether.com/pt/cancoes/presencia-del-senor-jesus-culture-evan-craft/",
  "https://www.worshiptogether.com/pt/cancoes/abra-o-livro-upperroom/",
  "https://www.worshiptogether.com/pt/cancoes/te-damos-gloria-ao-vivo-nivea-soares-gabriel-guedes/",
  "https://www.worshiptogether.com/pt/cancoes/nao-ha-outro-dunamis-music/",
  "https://www.worshiptogether.com/pt/cancoes/um-novo-dia-get-worship/"
];
let catalogCache = { expires: Date.now() + 20 * 60_000, urls: PUBLIC_CATALOG_URLS };

export function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function allowedSongUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['cifraclub.com.br', 'www.cifraclub.com.br'].includes(url.hostname)
      && !url.username && !url.password && !url.port && /^\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*\/?$/i.test(url.pathname)) {
      return `${CIFRA_ORIGIN}${url.pathname.replace(/\/?$/, '/')}`;
    }
    if (url.origin !== SOURCE_ORIGIN || url.username || url.password || url.port) return null;
    if (!/^\/(?:pt\/cancoes|songs)\/[a-z0-9-]+\/?$/.test(url.pathname)) return null;
    return `${SOURCE_ORIGIN}${url.pathname.replace(/\/?$/, '/')}`;
  } catch { return null; }
}

function decode(value) {
  return value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => {
    const number = Number.parseInt(hex || decimal, hex ? 16 : 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|sharp|flat);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sharp: '#', flat: 'b' })[entity]);
}

function text(value) { return decode(value.replace(/<[^>]*>/g, '')); }

/** The public autocomplete returns JSONP. Parse the JSON payload; never evaluate script. */
export function parseCifraClubSearch(body) {
  const payload = body.trim().replace(/^suggest_callback\(\s*/, '').replace(/\s*\);?\s*$/, '');
  let docs;
  try { docs = JSON.parse(payload)?.response?.docs; }
  catch { throw new Error('O Cifra Club retornou uma busca inválida.'); }
  if (!Array.isArray(docs)) throw new Error('O Cifra Club retornou uma busca inválida.');
  const seen = new Set();
  const results = [];
  for (const item of docs) {
    if (String(item?.t) !== '2' || item.block || !(Number(item.vci) > 0)
      || typeof item.txt !== 'string' || typeof item.art !== 'string'
      || !/^[a-z0-9][a-z0-9_-]*$/i.test(item.dns || '') || !/^[a-z0-9][a-z0-9_-]*$/i.test(item.url || '')) continue;
    const url = allowedSongUrl(`${CIFRA_ORIGIN}/${item.dns}/${item.url}/`);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // Return only metadata. The search index also contains lyrics; those are not imported here.
    results.push({ id: url, title: item.txt.slice(0, 300), artist: item.art.slice(0, 300), source: 'Cifra Club', sourceUrl: url, kind: 'chords' });
    if (results.length === 12) break;
  }
  return results;
}

// Consume suffixes once. Repeating a numeric regex inside another repetition
// makes malformed pasted chords (for example C111…x) block the browser.
const QUALITIES = ['maj', 'Maj', 'min', 'Min', 'dim', 'Dim', 'aug', 'Aug', 'sus', 'Sus', 'add', 'Add', 'omit', 'no', 'm', 'M', 'Δ', '°', 'ø'];
const PAREN_QUALITIES = ['maj', 'Maj', 'min', 'm', 'M'];

function validSuffix(value) {
  if (value.length > 80) return false;
  let cursor = 0;
  const digits = () => {
    const start = cursor;
    while (cursor < value.length && value[cursor] >= '0' && value[cursor] <= '9') cursor++;
    return cursor > start;
  };
  const quality = (names) => {
    const name = names.find(item => value.startsWith(item, cursor));
    if (!name) return false;
    cursor += name.length;
    return true;
  };
  const signedNumber = () => {
    if (['#', 'b', '+', '-'].includes(value[cursor])) cursor++;
    return digits();
  };
  while (cursor < value.length) {
    const token = value[cursor];
    if (token === '(') {
      cursor++;
      quality(PAREN_QUALITIES);
      if (!signedNumber()) return false;
      while (value[cursor] === ',' || value[cursor] === '/') {
        cursor++;
        if (!signedNumber()) return false;
      }
      if (value[cursor++] !== ')') return false;
    } else if (token === '/') {
      cursor++;
      if (!digits()) return false;
    } else if (quality(QUALITIES)) digits();
    else if (token === '+' || token === '-') { cursor++; digits(); }
    else if (!signedNumber()) return false;
  }
  return true;
}

function chord(value) {
  if (value.length > 84) return null;
  const normalized = value.replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(normalized);
  return match && validSuffix(match[2]) ? normalized : null;
}

function chordRow(line) {
  const label = /^\s*(\[[^\]\r\n]+\])\s*/.exec(line);
  const offset = label && !chord(label[1].slice(1, -1)) ? label[0].length : 0;
  let standalone = Boolean(offset);
  const chords = [];
  for (const token of line.slice(offset).matchAll(/\S+/g)) {
    const value = chord(token[0]);
    if (value) chords.push({ position: offset + token.index, end: offset + token.index + token[0].length, chord: value });
    else if (/^(?:[|:()]+|\(?\d+x\)?|\(?x\d+\)?)$/i.test(token[0])) standalone = true;
    else return null;
  }
  return chords.length ? { chords, standalone } : null;
}

/** Preserve the alignment of the chords actually present in the public page. */
export function convertCifraClubRows(value) {
  if (!value.trim() || value.length > 100_000) throw new Error('Não foi possível reconhecer uma cifra pública dentro do limite de tamanho.');
  const lines = value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n').map(line => {
    let result = '';
    for (const character of line) result += character === '\t' ? ' '.repeat(8 - result.length % 8) : character;
    return result;
  });
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const row = chordRow(line);
    const next = lines[index + 1];
    if (!row) { output.push(line); continue; }
    const align = !row.standalone && next?.trim() && !chordRow(next) && !/\[[^\]\r\n]+\]/.test(next);
    let result = '';
    let cursor = 0;
    if (align) {
      const characters = Array.from(next);
      for (const note of row.chords) {
        result += characters.slice(cursor, note.position).join('');
        if (note.position > characters.length) result += ' '.repeat(note.position - Math.max(cursor, characters.length));
        result += `[${note.chord}]`;
        cursor = note.position;
      }
      output.push(result + characters.slice(cursor).join(''));
      index++;
    } else {
      for (const note of row.chords) {
        result += `${line.slice(cursor, note.position)}[${note.chord}]`;
        cursor = note.end;
      }
      output.push(result + line.slice(cursor));
    }
  }
  return output.join('\n').trim();
}

export function parseCifraClubPage(html, url) {
  const canonical = allowedSongUrl(url);
  if (!canonical?.startsWith(CIFRA_ORIGIN)) throw new Error('Informe uma página pública de música do Cifra Club.');
  const pre = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].find(match => /<(?:b|strong)\b/i.test(match[1]));
  if (!pre) throw new Error('O Cifra Club não forneceu uma cifra pública reconhecida para esta versão.');
  const raw = text(pre[1].replace(/<br\s*\/?\s*>/gi, '\n'));
  const content = convertCifraClubRows(raw);
  if (!/\[[A-G](?:#|b)?[^\]\r\n]*\]/.test(content)) throw new Error('Não foi possível reconhecer os acordes públicos desta versão no Cifra Club.');
  const ogTitle = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => {
    const tag = match[0];
    return /\bproperty=["']og:title["']/i.test(tag) ? decode(/\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] || '') : '';
  }).find(Boolean) || '';
  const metadata = /^(.*?)\s+-\s+(.*?)\s+-\s+Cifra Club\s*$/i.exec(ogTitle);
  const title = text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '').trim() || metadata?.[1]?.trim();
  const artist = text(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(html)?.[1] || '').trim() || metadata?.[2]?.trim();
  if (!title || !artist) throw new Error('O Cifra Club retornou uma versão sem título ou artista reconhecidos.');
  const keyArea = /(?:id|class)=["'][^"']*\bcifra_tom\b[^"']*["'][^>]*>([\s\S]{0,1200})/i.exec(html)?.[1] || '';
  const keyLabel = text(keyArea.split(/<\/(?:a|span|div)>/i)[0]).trim();
  const originalKey = /^(?:tom\s*:\s*)?([A-G](?:#|b)?(?:m|maj|min)?)(?=\s|$)/i.exec(keyLabel)?.[1]
    || /\bdata-original-key=["']([A-G](?:#|b)?(?:m|maj|min)?)["']/i.exec(html)?.[1];
  return { id: canonical, title: title.slice(0, 300), artist: artist.slice(0, 300), content, ...(originalKey ? { originalKey } : {}), source: 'Cifra Club', sourceUrl: canonical, kind: 'chords' };
}

export function parseSongPage(html, url) {
  const headline = /<h1\b[^>]*class="[^"]*t-song-details__marquee__headline[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const metadata = /<meta\s+property="og:title"\s+content="([^"]+)"/i.exec(html);
  const title = headline ? text(headline[1]).trim() : '';
  const fullTitle = metadata ? decode(metadata[1]).replace(/\s*\|\s*Worship Together\s*$/i, '') : '';
  const artist = fullTitle.includes(' - ') ? fullTitle.slice(fullTitle.lastIndexOf(' - ') + 3).trim() : '';
  const originalKey = /\bdata-original-key="([^"]+)"/i.exec(html)?.[1] || '';
  const chordSection = /<div\b[^>]*id="chordPro"[^>]*>/i.exec(html);
  if (!title || !chordSection) throw new Error('A fonte não forneceu uma cifra pública reconhecida para esta música.');
  const lines = html.slice(chordSection.index).split(/<div\s+class="chord-pro-line"\s*>/i).slice(1);
  const content = lines.map(line => {
    const pairs = [...line.matchAll(/<div\s+class="chord-pro-note"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="chord-pro-lyric"[^>]*>([\s\S]*?)<\/div>/gi)];
    return pairs.map(pair => {
      const chord = text(pair[1]).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
      const lyric = text(pair[2]).replace(/\r/g, '');
      // Do not invent or infer any chords: use only the notes present in the public source.
      return `${chord ? `[${chord}]` : ''}${lyric}`;
    }).join('');
  }).filter(line => line.length).join('\n');
  if (!content || content.length > 100_000) throw new Error('Não foi possível reconhecer o conteúdo da cifra pública.');
  return { id: url, title, artist, originalKey, content, source: 'Worship Together', sourceUrl: url, kind: 'chords' };
}

async function fetchPublic(url, source = 'A fonte') {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8_000), headers: { Accept: 'text/html, application/xml;q=0.9', 'User-Agent': 'Candeia/1.0 (+public-song-reference)' } });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? `${source} bloqueou a consulta automática neste momento. Você pode abrir o link e usar a importação manual.` : `${source} está indisponível agora (HTTP ${response.status}). Tente novamente mais tarde.`);
  if (Number(response.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) throw new Error('A resposta da fonte excedeu o tamanho permitido.');
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_BYTES) { await reader.cancel(); throw new Error('A resposta da fonte excedeu o tamanho permitido.'); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function catalog() {
  if (catalogCache.expires > Date.now()) return catalogCache.urls;
  try {
    const xml = await fetchPublic(`${SOURCE_ORIGIN}/sitemap-pt.xml`);
    const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => allowedSongUrl(decode(match[1]))).filter(Boolean))];
    if (urls.length) catalogCache = { expires: Date.now() + 20 * 60_000, urls };
  } catch {
    // Keep previously verified public links available when the catalog is slow.
    // Opening a preview still requires a fresh, successful fetch from the actual page.
    catalogCache.expires = Date.now() + 20 * 60_000;
  }
  return catalogCache.urls;
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': statusCode === 200 ? 'public, max-age=300' : 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método não permitido.' });
  const params = event.queryStringParameters || {};
  try {
    if (params.url) {
      const url = allowedSongUrl(params.url);
      if (!url) return json(400, { error: 'Informe uma página pública de música do Cifra Club ou Worship Together.' });
      const isCifra = url.startsWith(CIFRA_ORIGIN);
      const html = await fetchPublic(url, isCifra ? 'O Cifra Club' : 'O Worship Together');
      return json(200, { song: isCifra ? parseCifraClubPage(html, url) : parseSongPage(html, url) });
    }
    const title = normalize((params.title || '').slice(0, 200));
    const artist = normalize((params.artist || '').slice(0, 200));
    if (title.length < 2) return json(400, { error: 'Informe pelo menos dois caracteres do título.' });
    if (params.source === 'cifraclub') {
      const query = [title, artist].filter(Boolean).join(' ');
      const body = await fetchPublic(`${CIFRA_SEARCH}?${new URLSearchParams({ q: query, rows: '12', wt: 'json' })}`, 'O Cifra Club');
      return json(200, { results: parseCifraClubSearch(body) });
    }
    const allTerms = title.split(' ').filter(Boolean);
    const keywords = allTerms.filter(term => term.length > 2 && !['de', 'do', 'da', 'das', 'dos', 'the', 'and', 'com', 'uma', 'para', 'por'].includes(term));
    const terms = keywords.length ? keywords : allTerms;
    const results = (await catalog()).map(url => {
      const slug = normalize(new URL(url).pathname.split('/').filter(Boolean).at(-1));
      const matched = terms.filter(term => slug.includes(term)).length;
      const score = matched / terms.length + (slug.includes(title) ? 1 : 0) + (artist && slug.includes(artist) ? 0.5 : 0);
      return { url, slug, matched, score };
    }).filter(item => item.matched >= Math.ceil(terms.length * 0.7)).sort((a, b) => b.score - a.score).slice(0, 5).map(item => ({ id: item.url, title: item.slug, artist: '', source: 'Worship Together', sourceUrl: item.url, kind: 'chords' }));
    return json(200, { results });
  } catch (cause) {
    return json(502, { error: cause?.name === 'TimeoutError' || cause?.name === 'AbortError' ? 'A consulta à fonte demorou demais. Tente novamente.' : cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'Não foi possível consultar a fonte de cifras. Tente novamente mais tarde.' });
  }
}
