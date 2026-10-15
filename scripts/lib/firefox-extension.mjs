/** Firefox packaging integrity; no credentials are read by this module. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';

export const FIREFOX_SOURCE = fileURLToPath(new URL('../../browser-extension/candeia-cifraclub-firefox/', import.meta.url));
export const FIREFOX_SIGNED_STATE = fileURLToPath(new URL('../../.netlify/firefox-signed/', import.meta.url));
export const FIREFOX_FILES = ['manifest.json', 'background.js', 'candeia-content.js', 'cifra-content.js', 'reader.js', 'README.md', 'PRIVACY.md'];
export const FIREFOX_ID = 'cifraclub-firefox@candeia.app';
export const WEB_EXT_VERSION = '10.7.0';
const execute = promisify(execFile);

export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export async function firefoxSources() {
  const hash = createHash('sha256');
  const contents = new Map();
  for (const name of FIREFOX_FILES) {
    const contentsOfFile = await readFile(`${FIREFOX_SOURCE}/${name}`);
    if (/(?:sbp_|nfp_)[A-Za-z0-9]{18,}|service_role/.test(contentsOfFile.toString())) throw new Error('O pacote Firefox contém dados privados inesperados.');
    contents.set(name, contentsOfFile);
    hash.update(name).update('\0').update(contentsOfFile).update('\0');
  }
  const manifest = JSON.parse(contents.get('manifest.json').toString());
  if (manifest.manifest_version !== 3 || manifest.browser_specific_settings?.gecko?.id !== FIREFOX_ID
    || manifest.background?.service_worker || manifest.background?.scripts?.join(',') !== 'reader.js,background.js') {
    throw new Error('Manifest Firefox incompatível com o piloto.');
  }
  return { contents, manifest, sourceSha256: hash.digest('hex') };
}

// AMO/web-ext supplies the signed archive. Check that its payload is precisely
// our reviewed sources and that signature records are present. This is an
// integrity/provenance check, not a replacement for Firefox's certificate check.
export async function inspectSignedArchive(path, sources) {
  const { stdout: listing } = await execute('unzip', ['-Z1', path], { maxBuffer: 256_000 });
  const entries = listing.trim().split('\n');
  if (new Set(entries).size !== entries.length || entries.some(name => name.startsWith('/') || name.split('/').includes('..'))) {
    throw new Error('Arquivo Firefox contém caminhos inválidos ou repetidos.');
  }
  if (!entries.includes('META-INF/mozilla.rsa') || !entries.includes('META-INF/mozilla.sf') || !entries.includes('META-INF/manifest.mf')) {
    throw new Error('O arquivo Firefox não contém os registros de assinatura esperados da Mozilla.');
  }
  if (entries.some(name => !FIREFOX_FILES.includes(name) && !name.startsWith('META-INF/'))) {
    throw new Error('O arquivo Firefox assinado contém arquivos inesperados.');
  }
  for (const [name, expected] of sources.contents) {
    const { stdout: actual } = await execute('unzip', ['-p', path, name], { encoding: 'buffer', maxBuffer: 1_000_000 });
    // AMO canonicalizes the manifest name (Unicode escapes and final newline).
    // Require every JSON field/type/value to match; scripts remain byte-exact.
    const matches = name === 'manifest.json'
      ? isDeepStrictEqual(JSON.parse(actual.toString()), JSON.parse(expected.toString()))
      : actual.equals(expected);
    if (!matches) throw new Error(`O arquivo Firefox assinado diverge das fontes: ${name}`);
  }
  return sha256(await readFile(path));
}

export async function signedFirefoxFor(sources) {
  let release;
  try { release = JSON.parse(await readFile(`${FIREFOX_SIGNED_STATE}/release.json`, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (release.sourceSha256 !== sources.sourceSha256 || release.version !== sources.manifest.version) return null;
  if (release.provenance !== `web-ext@${WEB_EXT_VERSION}:amo-unlisted` || !/^[a-f0-9]{64}$/.test(release.sha256)) {
    throw new Error('A origem do pacote Firefox assinado não foi reconhecida.');
  }
  const path = `${FIREFOX_SIGNED_STATE}/candeia-cifraclub-firefox.xpi`;
  const digest = await inspectSignedArchive(path, sources);
  if (digest !== release.sha256) throw new Error('A integridade do pacote Firefox assinado não confere.');
  return { path, sha256: digest };
}
