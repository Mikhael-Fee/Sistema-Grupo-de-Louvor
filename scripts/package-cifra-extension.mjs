/** Produce only the public browser importer; no environment files or tokens. */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

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
console.log('Importador Cifra Club empacotado para download.');
