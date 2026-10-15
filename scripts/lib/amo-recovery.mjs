/** Authenticated AMO GETs only. Credentials never appear in curl arguments. */
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';

export function amoJwt(issuer, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof issuer !== 'string' || !issuer || typeof secret !== 'string' || !secret || !Number.isSafeInteger(now)) throw new Error('Credenciais AMO ausentes ou inválidas.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, iat: now, exp: now + 120, jti: randomUUID() })}`;
  return `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`;
}

export function versionsUrl(addonId) {
  return `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(addonId)}/versions/?filter=all_with_unlisted`;
}

export function allowedAmoUrl(value, addonId, kind) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Endereço AMO inválido.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'addons.mozilla.org' || url.port || url.username || url.password || url.hash) throw new Error('Endereço AMO fora da origem permitida.');
  const expected = new URL(versionsUrl(addonId));
  if (kind === 'versions') {
    if (url.pathname !== expected.pathname || url.searchParams.get('filter') !== 'all_with_unlisted'
      || [...url.searchParams.keys()].some(key => !['filter', 'page', 'page_size'].includes(key))) throw new Error('Paginação AMO fora da rota permitida.');
  } else if (kind !== 'download' || !/^\/firefox\/downloads\/file\/[1-9]\d*\/[a-zA-Z0-9._%-]+\.xpi$/.test(url.pathname)) {
    throw new Error('Endereço do pacote AMO fora da rota permitida.');
  }
  return url.href;
}

export function matchingUnlistedVersion(data, version) {
  if (!data || !Array.isArray(data.results)) throw new Error('Resposta AMO sem lista de versões.');
  const result = data.results.find(item => item?.version === version && item.channel === 'unlisted');
  if (!result) return null;
  if (!result.file || !/^sha256:[a-f0-9]{64}$/.test(result.file.hash)
    || !Number.isSafeInteger(result.id) || result.id < 1 || !Number.isSafeInteger(result.file.id) || result.file.id < 1
    || !Number.isSafeInteger(result.file.size) || result.file.size < 1 || result.file.size > 2_000_000
    || result.file.status === 'disabled') throw new Error('A versão AMO não contém um pacote assinado utilizável.');
  return result;
}

export async function amoGetToFile(url, jwt, destination, maxBytes) {
  // Do not follow redirects: this prevents forwarding the Authorization header
  // to a CDN or another origin. Normal proxy and CA verification stay enabled.
  const quote = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const config = `url = ${quote(url)}\nheader = ${quote(`Authorization: JWT ${jwt}`)}\n`;
  const args = ['--disable', '--silent', '--show-error', '--fail', '--proto', '=https', '--connect-timeout', '10', '--max-time', '30',
    '--max-filesize', String(maxBytes), '--output', destination, '--write-out', '%{http_code}', '--config', '-'];
  const { code, status } = await new Promise((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let status = '';
    child.stdout.on('data', value => { status = (status + value.toString()).slice(-8); });
    child.stderr.resume(); // Never print transport bodies or authentication data.
    child.on('error', reject);
    child.on('exit', code => resolve({ code, status }));
    child.stdin.on('error', () => {});
    child.stdin.end(config);
  });
  if (code !== 0 || status !== '200') throw new Error(`A consulta GET à Mozilla falhou (HTTP ${/^\d{3}$/.test(status) ? status : 'indisponível'}).`);
  if ((await stat(destination)).size > maxBytes) throw new Error('Resposta AMO excede o limite de tamanho.');
  return readFile(destination);
}
