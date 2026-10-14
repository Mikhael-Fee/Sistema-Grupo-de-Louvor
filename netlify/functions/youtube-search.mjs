// Read public YouTube video metadata, only after Supabase verifies an approved account.
// Standalone because the direct deployment helper bundles one .mjs per function.
const ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_BYTES = 3_000_000;
const cache = new Map();
const requests = new Map();
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function limitedBody(response, max = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > max) throw new Error('source-size');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) throw new Error('source-size');
      chunks.push(value);
    }
  } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

function text(value) {
  if (typeof value?.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value?.runs)) return value.runs.map(run => typeof run?.text === 'string' ? run.text : '').join('');
  return '';
}

export function parseYouTubeData(data) {
  const results = []; const seen = new Set(); const queue = [data]; let visited = 0;
  while (queue.length && visited++ < 20_000 && results.length < 6) {
    const node = queue.pop();
    if (!node || typeof node !== 'object') continue;
    const video = node.videoRenderer;
    if (video && typeof video.videoId === 'string' && ID.test(video.videoId) && !seen.has(video.videoId)) {
      const title = text(video.title).trim().slice(0, 200);
      if (title) {
        seen.add(video.videoId);
        results.push({ id: video.videoId, title, channel: text(video.ownerText || video.longBylineText || video.shortBylineText).trim().slice(0, 200), url: `https://www.youtube.com/watch?v=${video.videoId}`, thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` });
      }
    }
    const children = Array.isArray(node) ? node : Object.values(node);
    for (let index = children.length - 1; index >= 0; index--) if (children[index] && typeof children[index] === 'object') queue.push(children[index]);
  }
  return results;
}

/** Extract JSON without evaluating scripts or including recommendations from unrelated HTML. */
export function parseYouTubeHtml(html) {
  if (typeof html !== 'string' || html.length > MAX_BYTES) throw new Error('source-size');
  const marker = /(?:var\s+ytInitialData\s*=|window\s*\[\s*["']ytInitialData["']\s*\]\s*=|ytInitialData\s*=)\s*/g;
  const match = marker.exec(html);
  if (!match || html[marker.lastIndex] !== '{') throw new Error('source-format');
  let depth = 0; let quoted = false; let escaped = false; const start = marker.lastIndex;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return parseYouTubeData(JSON.parse(html.slice(start, index + 1)));
  }
  throw new Error('source-format');
}

function configuration() {
  const value = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || !key || /[\r\n]/.test(key)) return null;
    return { origin: url.origin, key };
  } catch { return null; }
}

async function approvedUser(token, config) {
  const options = { headers: { apikey: config.key, Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4_000) };
  const auth = await fetch(`${config.origin}/auth/v1/user`, options);
  if (!auth.ok) return { status: 401 };
  const user = JSON.parse(await limitedBody(auth, 64_000));
  if (typeof user?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return { status: 401 };
  const profile = await fetch(`${config.origin}/rest/v1/profiles?${new URLSearchParams({ select: 'id,approved', id: `eq.${user.id}`, limit: '1' })}`, { ...options, signal: AbortSignal.timeout(4_000) });
  if (!profile.ok) throw new Error('auth-source');
  const rows = JSON.parse(await limitedBody(profile, 8_000));
  return Array.isArray(rows) && rows[0]?.id === user.id && rows[0]?.approved === true ? { id: user.id } : { status: 403 };
}

function acceptRequest(userId) {
  const now = Date.now(); const previous = requests.get(userId);
  if (previous && previous.until > now) { if (previous.count >= 15) return false; previous.count++; }
  else requests.set(userId, { until: now + 60_000, count: 1 });
  if (requests.size > 512) { for (const [key, value] of requests) if (value.until <= now) requests.delete(key); }
  if (requests.size > 512) requests.delete(requests.keys().next().value);
  return true;
}

async function queryVideos(title, artist) {
  const query = [title, artist].filter(Boolean).join(' ');
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey && !/[\r\n]/.test(apiKey)) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '6', q: query, key: apiKey, relevanceLanguage: 'pt' })}`, { redirect: 'error', signal: AbortSignal.timeout(7_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('source-blocked');
    const data = JSON.parse(await limitedBody(response, 256_000));
    return (data.items || []).filter(item => ID.test(item?.id?.videoId || '') && typeof item?.snippet?.title === 'string').slice(0, 6).map(item => ({ id: item.id.videoId, title: item.snippet.title.slice(0, 200), channel: String(item.snippet.channelTitle || '').slice(0, 200), url: `https://www.youtube.com/watch?v=${item.id.videoId}`, thumbnailUrl: `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg` }));
  }
  const response = await fetch(`https://www.youtube.com/results?${new URLSearchParams({ search_query: query, hl: 'pt', gl: 'BR' })}`, { redirect: 'error', signal: AbortSignal.timeout(7_000), headers: { Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; Candeia/1.0)' } });
  if (!response.ok) throw new Error('source-blocked');
  return parseYouTubeHtml(await limitedBody(response));
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Use GET para buscar vídeos.' });
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
  if (!token || token.length > 4096) return reply(401, { error: 'Entre na sua conta para buscar vídeos.' });
  const title = event.queryStringParameters?.title?.trim() || '';
  const artist = event.queryStringParameters?.artist?.trim() || '';
  if (title.length < 2 || title.length > 200 || artist.length > 200 || /[\x00-\x1f]/.test(title + artist)) return reply(400, { error: 'Informe um título de 2 a 200 caracteres e, se souber, o artista.' });
  const config = configuration();
  if (!config) return reply(503, { error: 'A busca de vídeos ainda não está configurada. Abra a busca no YouTube e cole o link escolhido.' });
  let user;
  try { user = await approvedUser(token, config); }
  catch { return reply(503, { error: 'Não foi possível confirmar sua conta. Tente novamente em instantes.' }); }
  if (user.status) return reply(user.status, { error: user.status === 403 ? 'Seu cadastro precisa estar aprovado para buscar vídeos.' : 'Entre novamente na sua conta para buscar vídeos.' });
  if (!acceptRequest(user.id)) return reply(429, { error: 'Aguarde um minuto antes de fazer mais buscas de vídeo.' });
  const signature = `${title.toLocaleLowerCase('pt-BR')}\n${artist.toLocaleLowerCase('pt-BR')}`;
  const cached = cache.get(signature);
  if (cached && cached.until > Date.now()) return reply(200, cached.value);
  try {
    const results = await queryVideos(title, artist);
    const value = { results, ...(results.length ? {} : { warning: 'Nenhum vídeo encontrado. Revise o título e artista ou abra a busca no YouTube.' }) };
    cache.set(signature, { until: Date.now() + 5 * 60_000, value });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return reply(200, value);
  } catch { return reply(502, { error: 'O YouTube não liberou as sugestões neste momento. Abra a busca no YouTube e cole o link da versão escolhida.' }); }
}
