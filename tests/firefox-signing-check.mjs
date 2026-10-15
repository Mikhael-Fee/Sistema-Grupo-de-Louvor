import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { allowedAmoUrl, amoJwt, matchingUnlistedVersion, versionsUrl } from '../scripts/lib/amo-recovery.mjs';

const id = 'cifraclub-firefox@candeia.app';
const file = { id: 5125012, size: 19355, hash: `sha256:${'a'.repeat(64)}`, status: 'public' };

test('JWT AMO é assinado, expira em dois minutos e não contém o segredo', () => {
  const token = amoJwt('test-issuer', 'test-only-secret', 1000);
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(decoded.iss, 'test-issuer');
  assert.equal(decoded.iat, 1000);
  assert.equal(decoded.exp, 1120);
  assert.equal(typeof decoded.jti, 'string');
  assert.equal(signature, createHmac('sha256', 'test-only-secret').update(`${header}.${payload}`).digest('base64url'));
  assert.equal(JSON.stringify(decoded).includes('test-only-secret'), false);
});

test('recuperação admite somente paginação exata AMO unlisted', () => {
  const url = versionsUrl(id);
  assert.equal(allowedAmoUrl(`${url}&page=2`, id, 'versions'), `${url}&page=2`);
  for (const invalid of [url.replace('https:', 'http:'), url.replace('addons.mozilla.org', 'addons.mozilla.org.evil.test'),
    url.replace('addons.mozilla.org', 'user@addons.mozilla.org'), url.replace('/versions/', '/'), url.replace('all_with_unlisted', 'listed'), `${url}&evil=1`]) {
    assert.throws(() => allowedAmoUrl(invalid, id, 'versions'));
  }
});

test('download autenticado fica limitado à rota XPI oficial', () => {
  const url = 'https://addons.mozilla.org/firefox/downloads/file/5125012/candeia-1.1.1.xpi';
  assert.equal(allowedAmoUrl(url, id, 'download'), url);
  for (const invalid of [url.replace('addons.mozilla.org', 'cdn.example.com'), url.replace('.xpi', '.html'), `${url}#fragment`, url.replace('/downloads/file/', '/accounts/')]) {
    assert.throws(() => allowedAmoUrl(invalid, id, 'download'));
  }
});

test('seleção nunca recupera outra versão ou um pacote listado', () => {
  const chosen = { version: '1.1.1', channel: 'unlisted', id: 6580880, file };
  assert.deepEqual(matchingUnlistedVersion({ results: [{ ...chosen, channel: 'listed' }, { ...chosen, version: '1.1.2' }, chosen] }, '1.1.1'), chosen);
  assert.equal(matchingUnlistedVersion({ results: [{ ...chosen, channel: 'listed' }] }, '1.1.1'), null);
  for (const changed of [{ hash: 'sha256:short' }, { size: 2_000_001 }, { status: 'disabled' }, { id: -1 }]) {
    assert.throws(() => matchingUnlistedVersion({ results: [{ ...chosen, file: { ...file, ...changed } }] }, '1.1.1'));
  }
});
