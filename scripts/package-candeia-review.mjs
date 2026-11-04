/** Assemble review evidence from this run only. No credentials or network access. */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = resolve(root, process.env.REVIEW_OUTPUT_DIR || 'work/candeia-revisao');
const results = resolve(root, process.env.REVIEW_RESULTS_DIR || 'test-results');
const logs = resolve(root, process.env.REVIEW_LOG_DIR || 'work/ci-results');
const base = process.env.REVIEW_BASE_SHA || 'e1b26c7a1961d6f1e0a07e3da554d49c01ed7a59';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
const commit = git('rev-parse', 'HEAD');
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('branch', '--show-current');
const runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const problems = [];
const widths = [1280, 360, 390, 320];
const stages = new Map([
  ['01-cadastro-admin.png', 'cadastro'], ['02-previa-admin.png', 'previa'],
  ['03-leitura-musico-sem-extensao.png', 'leitura'], ['04-sem-importador.png', 'sem-importador'],
  ['05-falha-conexao-rascunho.png', 'falha-conexao'],
]);

if (!output.startsWith(join(root, 'work') + '/')) throw new Error('Review output must stay under work/.');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'capturas'), { recursive: true });
await mkdir(join(output, 'logs'), { recursive: true });

const readOptional = async path => { try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const jsonOptional = async path => { const value = await readOptional(path); return value === null ? null : JSON.parse(value); };
const textLogs = {};
for (const name of ['install', 'typecheck', 'unit', 'db', 'build', 'browser-install', 'e2e']) {
  const text = await readOptional(join(logs, `${name}.log`));
  textLogs[name] = text;
  if (text !== null) await writeFile(join(output, 'logs', `${name}.log`), text);
}
const unit = await jsonOptional(join(logs, 'unit.json'));
const playwright = await jsonOptional(join(logs, 'playwright.json'));
for (const name of ['unit.json', 'playwright.json']) {
  const text = await readOptional(join(logs, name));
  if (text !== null) await writeFile(join(output, 'logs', name), text);
}
const checks = [...(textLogs.db || '').matchAll(/^(\d+) .*PostgreSQL (?:assertions|checks) passed/gm)].map(match => Number(match[1]));
let extensionPassed = 0;
function countExtension(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) if ((spec.file || suite.file || '').endsWith('cifra-browser.spec.ts')) {
      extensionPassed += spec.tests.filter(test => test.results?.at(-1)?.status === 'passed').length;
    }
    countExtension(suite.suites);
  }
}
countExtension(playwright?.suites);
const statusKeys = ['INSTALL', 'TYPECHECK', 'UNIT', 'DB', 'BUILD', 'BROWSER_INSTALL', 'E2E'];
const outcomes = Object.fromEntries(statusKeys.map(key => [key.toLowerCase(), process.env[`REVIEW_${key}_OUTCOME`] || 'não informado']));
for (const [step, outcome] of Object.entries(outcomes)) if (outcome !== 'success' && outcome !== 'não informado') problems.push(`Etapa ${step}: ${outcome}.`);
if (!unit) problems.push('Relatório JSON de testes unitários ausente.');
if (!playwright) problems.push('Relatório JSON do Playwright ausente.');
if (unit && !(unit.numPassedTests > 0)) problems.push('O relatório unitário não registra testes aprovados.');
if (playwright && !(playwright.stats?.expected > 0)) problems.push('O relatório Playwright não registra testes aprovados.');
if (unit?.numFailedTests) problems.push(`${unit.numFailedTests} testes unitários falharam.`);
if (playwright?.stats?.unexpected || playwright?.stats?.flaky || playwright?.stats?.skipped) problems.push('Playwright registrou falhas, repetições por falha ou casos pulados; confira o relatório JSON.');
if (checks.length !== 6) problems.push(`Esperados 6 resumos de banco; encontrados ${checks.length}.`);
if (process.env.VITE_SUPABASE_URL !== 'https://supabase.candeia.test') problems.push('A execução não informou a URL fictícia esperada para o Supabase.');

const captures = [];
let folders = [];
try { folders = await readdir(results, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const folder of folders.filter(entry => entry.isDirectory() && entry.name.startsWith('cifra-role-cycle-'))) {
  // Only original screenshots directly under a test result folder, never attachment copies.
  const directory = join(results, folder.name);
  for (const file of await readdir(directory)) {
    if (!stages.has(file)) continue;
    const png = await readFile(join(directory, file));
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      problems.push(`PNG inválido: ${folder.name}/${file}`); continue;
    }
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    if (!widths.includes(width) || height < 1) { problems.push(`Dimensão inesperada em ${folder.name}/${file}: ${width}x${height}`); continue; }
    const name = `${width === 1280 ? 'desktop' : 'mobile'}-${width}-${stages.get(file)}.png`;
    if (captures.some(capture => capture.file === name)) { problems.push(`Captura duplicada: ${name}`); continue; }
    await copyFile(join(directory, file), join(output, 'capturas', name));
    captures.push({ file: name, width, height, stage: stages.get(file), sha256: createHash('sha256').update(png).digest('hex') });
  }
}
for (const width of widths) for (const stage of stages.values()) {
  if (!captures.some(capture => capture.width === width && capture.stage === stage)) problems.push(`Captura ausente: ${width}px / ${stage}.`);
}
if (captures.length !== 20) problems.push(`Esperadas exatamente 20 capturas; encontradas ${captures.length}.`);

const diff = git('diff', '--binary', base, commit);
await writeFile(join(output, 'alteracoes.patch'), diff + '\n');
await writeFile(join(output, 'diff-stat.txt'), git('diff', '--stat', base, commit) + '\n');
const stats = playwright?.stats;
const manifest = {
  branch, commit, base, actions_url: runUrl, generated_at: new Date().toISOString(), outcomes,
  unit_tests_passed: unit?.numPassedTests ?? null, unit_tests_failed: unit?.numFailedTests ?? null,
  database_checks_passed: checks.length === 6 ? checks.reduce((sum, value) => sum + value, 0) : null,
  browser_tests_passed: stats?.expected ?? null, browser_tests_failed: stats?.unexpected ?? null,
  browser_tests_flaky: stats?.flaky ?? null, browser_tests_skipped: stats?.skipped ?? null,
  real_chromium_extension_tests_passed: playwright ? extensionPassed : null,
  screenshots: captures.length, captures, evidence_complete: problems.length === 0, problems,
  validation_passed: problems.length === 0 && Object.values(outcomes).every(outcome => outcome === 'success')
    && unit?.numFailedTests === 0 && stats?.unexpected === 0 && stats?.skipped === 0 && stats?.flaky === 0,
  physical_firefox_android: 'pendente', production_database_changed: false, netlify_deployed: false,
};
await writeFile(join(output, 'manifesto.json'), JSON.stringify(manifest, null, 2) + '\n');
const template = await readFile(join(root, 'docs/CANDEIA-REVISAO.md'), 'utf8');
const commands = [
  ['install', 'npm ci'], ['typecheck', 'npm run typecheck'], ['unit', 'npm test -- --reporter=dot --reporter=json --outputFile=work/ci-results/unit.json'],
  ['db', 'npm run test:db'], ['build', 'npm run build'], ['browser_install', 'npx playwright install --with-deps chromium'],
  ['e2e', 'npm run test:e2e -- --reporter=list,json'],
];
const display = value => value === null || value === undefined ? 'não disponível' : String(value);
const header = `# Candeia — revisão de importação e CI\n\nBranch: \`${branch}\`. Commit: \`${commit}\`. Base: \`${base}\`.\n\n${runUrl ? `Execução: [GitHub Actions](${runUrl}).` : 'Pacote local; sem execução GitHub Actions identificada.'}\n\n`;
const summary = `## Resultados desta execução\n\n| Comando | Resultado |\n| --- | --- |\n${commands.map(([key, command]) => `| \`${command}\` | ${outcomes[key]} |`).join('\n')}\n\n` +
  `- Unitários: ${display(manifest.unit_tests_passed)} passaram; ${display(manifest.unit_tests_failed)} falharam.\n` +
  `- Banco isolado: ${display(manifest.database_checks_passed)} checks em ${checks.length} scripts.\n` +
  `- Navegador: ${display(manifest.browser_tests_passed)} passaram; ${display(manifest.browser_tests_failed)} falharam; ${display(manifest.browser_tests_skipped)} pulados; ${display(manifest.browser_tests_flaky)} com repetição por falha.\n` +
  `- Extensão Chromium real com websites simulados: ${display(manifest.real_chromium_extension_tests_passed)} passaram.\n` +
  `- Capturas: ${captures.length}/20. Firefox físico: pendente.\n` +
  `- Validação completa desta execução: ${manifest.validation_passed ? 'aprovada' : 'não aprovada ou não informada'}.\n\n${problems.length ? `Evidência incompleta:\n\n${problems.map(problem => `- ${problem}`).join('\n')}\n\n` : 'Evidências obrigatórias presentes.\n\n'}`;
await writeFile(join(output, 'relatorio.md'), header + summary + template);
await writeFile(join(output, 'capturas', 'index.md'), '# Capturas\n\n' + captures.sort((a, b) => a.file.localeCompare(b.file)).map(capture => `- [${basename(capture.file)}](${capture.file}) — ${capture.width} × ${capture.height}`).join('\n') + '\n');
console.log(JSON.stringify({ package: output, commit, screenshots: captures.length, complete: problems.length === 0, problems }));
if (problems.length) process.exitCode = 1;
