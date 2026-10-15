/** Explicit maintainer operation: upload this pilot to AMO for unlisted signing. */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIREFOX_ID, FIREFOX_SIGNED_STATE, WEB_EXT_VERSION, firefoxSources, inspectSignedArchive, sha256 } from './lib/firefox-extension.mjs';
import { allowedAmoUrl, amoGetToFile, amoJwt, matchingUnlistedVersion, versionsUrl } from './lib/amo-recovery.mjs';

const operation = process.argv.slice(2).join(' ');
if (!['--submit-unlisted', '--recover-unlisted'].includes(operation)) {
  console.log('Operação não executada. Recuperar uma versão já assinada: --recover-unlisted. Enviar uma nova versão à Mozilla: --submit-unlisted.');
  process.exit(0);
}
const apiKey = process.env.AMO_JWT_ISSUER || process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.AMO_JWT_SECRET || process.env.WEB_EXT_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error('Assinatura pendente: defina AMO_JWT_ISSUER e AMO_JWT_SECRET no ambiente seguro do mantenedor AMO. Nenhum pacote foi enviado.');
  process.exit(1);
}
const sources = await firefoxSources();
const redact = value => {
  for (const secret of [apiKey, apiSecret]) value = value.split(secret).join('[redigido]');
  return value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]');
};
await mkdir(FIREFOX_SIGNED_STATE, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'candeia-firefox-sign-'));
try {
  if (operation === '--recover-unlisted') {
    console.log('Consultando a versão unlisted já assinada na Mozilla. Somente leitura; nenhum pacote será enviado.');
    let next = versionsUrl(FIREFOX_ID);
    let version;
    const visited = new Set();
    for (let page = 0; next && page < 20; page++) {
      const url = allowedAmoUrl(next, FIREFOX_ID, 'versions');
      if (visited.has(url)) throw new Error('A paginação AMO repetiu um endereço.');
      visited.add(url);
      const bytes = await amoGetToFile(url, amoJwt(apiKey, apiSecret), join(temporary, 'versions.json'), 500_000);
      const data = JSON.parse(bytes.toString());
      version = matchingUnlistedVersion(data, sources.manifest.version);
      if (version) break;
      next = data.next;
    }
    if (!version) throw new Error('Nenhuma versão unlisted assinada corresponde à versão atual das fontes. Nenhum pacote foi enviado ou substituído.');
    const url = allowedAmoUrl(version.file.url, FIREFOX_ID, 'download');
    const path = join(temporary, 'recovered.xpi');
    const bytes = await amoGetToFile(url, amoJwt(apiKey, apiSecret), path, 2_000_000);
    const digest = sha256(bytes);
    if (version.file.hash !== `sha256:${digest}` || bytes.length !== version.file.size) throw new Error('O tamanho ou SHA256 do pacote diverge da resposta oficial AMO.');
    if (await inspectSignedArchive(path, sources) !== digest) throw new Error('A integridade do pacote recuperado não confere.');
    if ((await firefoxSources()).sourceSha256 !== sources.sourceSha256) throw new Error('As fontes mudaram durante a recuperação. Repita com as fontes finais.');
    await copyFile(path, `${FIREFOX_SIGNED_STATE}/candeia-cifraclub-firefox.xpi`);
    await writeFile(`${FIREFOX_SIGNED_STATE}/release.json`, JSON.stringify({ version: version.version, sourceSha256: sources.sourceSha256,
      sha256: digest, provenance: `web-ext@${WEB_EXT_VERSION}:amo-unlisted`, receivedAt: new Date().toISOString(),
      amoAddonGuid: FIREFOX_ID, amoVersionId: version.id, amoFileId: version.file.id, recoveredFromOfficialAPI: true }, null, 2) + '\n');
    console.log('XPI oficial recuperado; hash, tamanho e conteúdo conferidos. Execute o build para incluí-lo no próximo deploy.');
    process.exitCode = 0;
  } else {
  // web-ext may create resume files in its source directory. Keep those
  // transient API artifacts outside the repository and sign only these files.
  const signingSource = join(temporary, 'source');
  await mkdir(signingSource);
  for (const [name, contents] of sources.contents) await writeFile(join(signingSource, name), contents);
  console.log('Solicitando assinatura Mozilla para distribuição própria (unlisted). A revisão pode exigir etapas adicionais.');
  const args = ['--cache', join(tmpdir(), 'candeia-web-ext-npm-cache'), 'exec', '--yes', `--package=web-ext@${WEB_EXT_VERSION}`, '--', 'web-ext', 'sign',
    '--no-config-discovery', '--no-input', '--channel=unlisted', '--source-dir', signingSource, '--artifacts-dir', temporary, '--timeout', '900000'];
  const exitCode = await new Promise((resolve, reject) => {
    // Node 24 fetch does not use HTTPS_PROXY unless explicitly enabled. Keep
    // AMO traffic on the provisioned proxy with normal CA/TLS verification.
    const child = spawn('npm', args, { env: { ...process.env,
      ...((process.env.HTTPS_PROXY || process.env.https_proxy) ? { NODE_USE_ENV_PROXY: '1' } : {}),
      XDG_CONFIG_HOME: join(temporary, 'config'), NO_UPDATE_NOTIFIER: '1',
      WEB_EXT_API_KEY: apiKey, WEB_EXT_API_SECRET: apiSecret }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output = (output + chunk.toString()).slice(-50_000);
      void writeFile(`${FIREFOX_SIGNED_STATE}/signing-progress.json`, JSON.stringify({ at: new Date().toISOString(),
        sourceSha256: sources.sourceSha256, output: redact(output).slice(-5_000) }, null, 2)).catch(() => {});
    });
    child.on('error', reject);
    child.on('exit', code => {
      // web-ext takes credentials from environment, not command arguments.
      // Suppress normal output and redact known secrets from failure details.
      if (code !== 0) {
        console.error(redact(output).slice(-5_000));
      }
      resolve(code);
    });
  });
  if (exitCode !== 0) throw new Error('A Mozilla não entregou um pacote assinado. Nenhum download público foi alterado.');
  const candidates = (await readdir(temporary)).filter(name => name.endsWith('.xpi'));
  if (candidates.length !== 1) throw new Error('Não foi possível identificar um único XPI assinado na resposta da Mozilla.');
  const signedPath = join(temporary, candidates[0]);
  const sha256 = await inspectSignedArchive(signedPath, sources);
  // Do not publish an artifact if source changed while the external review ran.
  if ((await firefoxSources()).sourceSha256 !== sources.sourceSha256) throw new Error('As fontes mudaram durante a assinatura. Refaça a solicitação para a versão final.');
  await mkdir(FIREFOX_SIGNED_STATE, { recursive: true });
  await copyFile(signedPath, `${FIREFOX_SIGNED_STATE}/candeia-cifraclub-firefox.xpi`);
  await writeFile(`${FIREFOX_SIGNED_STATE}/release.json`, JSON.stringify({ version: sources.manifest.version, sourceSha256: sources.sourceSha256,
    sha256, provenance: `web-ext@${WEB_EXT_VERSION}:amo-unlisted`, receivedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('XPI assinado recebido e conferido. Execute o build para incluir o download no próximo deploy.');
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
