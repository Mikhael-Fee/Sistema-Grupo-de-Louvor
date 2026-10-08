/** Produce only the public browser importer; no environment files or tokens. */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { transformWithEsbuild } from 'vite';

const source = fileURLToPath(new URL('../browser-extension/candeia-cifraclub/', import.meta.url));
const destination = fileURLToPath(new URL('../public/downloads/candeia-cifraclub.zip', import.meta.url));
const files = ['manifest.json', 'background.js', 'candeia-content.js', 'cifra-content.js', 'reader.js', 'README.md'];
for (const name of files) {
  const path = `${source}/${name}`;
  if (!(await stat(path)).isFile()) throw new Error(`Arquivo do importador ausente: ${name}`);
  const text = await readFile(path, 'utf8');
  if (/(?:sbp_|nfp_)[A-Za-z0-9]{18,}|service_role/.test(text)) throw new Error('O pacote contém dados privados inesperados.');
}
const manifest = JSON.parse(await readFile(`${source}/manifest.json`, 'utf8'));
if (manifest.manifest_version !== 3 || manifest.name !== 'Candeia — Importar do Cifra Club') throw new Error('Manifest do importador inválido.');
await mkdir(fileURLToPath(new URL('../public/downloads/', import.meta.url)), { recursive: true });
await rm(destination, { force: true });
await promisify(execFile)('zip', ['-q', '-X', destination, ...files], { cwd: source });

// Both mobile alternatives run in a chart the user has already opened.
// Inline the same bounded reader as the desktop extension: no remote script,
// fetch, clipboard access, cookies, or dependence on an opener window.
const reader = await readFile(`${source}/reader.js`, 'utf8');
const extract = `
const globalThis = {};
${reader}
const result = globalThis.CandeiaCifraReader.readDocument(document, location.href, location.href);
if (!result) throw new Error('Abra a página da cifra com os acordes e aguarde o carregamento antes de importar.');
const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, result }));
let binary = '';
for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
const payload = btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
if (payload.length > 100000) throw new Error('Esta cifra é muito grande para transferir pelo celular. Use o importador do computador.');
const transferUrl = 'https://louvor-grupo-fxebsy.netlify.app/importar-cifra#candeia-cifra=' + payload;
`;
const report = `alert('Candeia: ' + (error instanceof Error ? error.message : 'Não foi possível ler esta cifra.').slice(0, 300));`;
const favoriteCode = await transformWithEsbuild(`(() => { try { ${extract}\nlocation.assign(transferUrl); } catch (error) { ${report} } })()`, 'candeia-favorite.js', { minify: true, target: 'es2020', sourcemap: false });
const favorite = `javascript:${encodeURIComponent(favoriteCode.code.trim())}`;
// Shortcuts calls completion exactly once on success. A runtime error stops
// the following Open URLs action; alert dialogs can time out in this host.
const shortcutError = `throw new Error(('Candeia: ' + (error instanceof Error ? error.message : 'Não foi possível ler esta cifra.')).slice(0, 300));`;
const shortcutCode = await transformWithEsbuild(`(() => { try { ${extract}\ncompletion(transferUrl); } catch (error) { ${shortcutError} } })();`, 'candeia-shortcut.js', { minify: true, target: 'es2020', sourcemap: false });
const shortcut = shortcutCode.code;
await writeFile(fileURLToPath(new URL('../public/downloads/candeia-cifra-celular.txt', import.meta.url)), favorite);
await writeFile(fileURLToPath(new URL('../public/downloads/candeia-cifra-iphone.js', import.meta.url)), shortcut);
console.log('Importadores Cifra Club para computador e celular preparados para download.');
