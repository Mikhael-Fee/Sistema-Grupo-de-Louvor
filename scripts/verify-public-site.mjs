/** Read-only production guest/PWA/mobile checks. No accounts or demo records. */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const state = JSON.parse(await readFile('/workspace/scratch/louvor-netlify-state.json', 'utf8'));
const origin = new URL(state.url).origin;
if (state.state !== 'ready' || !origin.startsWith('https://')) throw new Error('Deploy não está pronto.');
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE|DEBUG|PWDEBUG/i.test(name)));
const proxyValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
const proxyUrl = proxyValue ? new URL(proxyValue) : null;
const proxy = proxyUrl ? { server: proxyUrl.origin,
  ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
  ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
} : undefined;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], env, ...(proxy ? { proxy } : {}) });
let checks = 0;
let transpositionChecked = false;
let diagnosticPage;
const expect = (condition, label) => { if (!condition) throw new Error(label); checks++; };
let stage = 'login';
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  diagnosticPage = page;
  const writes = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      && /\/(?:rest|storage)\/v1\//.test(path) && !/\/rpc\/(read_public_ministry|get_public_access)$/.test(path)) writes.push(path);
  });
  page.setDefaultTimeout(25000);
  await page.goto(origin);
  expect(await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).isVisible(), 'Login real disponível');
  expect(await page.getByRole('button', { name: /demonstração/i }).count() === 0, 'Demonstração removida');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Login cabe no celular');
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await page.locator('.public-banner').waitFor();
  expect(await page.getByRole('heading', { name: /^Olá,/ }).isVisible(), 'Consulta sem cadastro abre dados reais');
  stage = 'cultos públicos';
  await page.goto(`${origin}/cultos`);
  await page.getByRole('heading', { name: 'Cultos', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Novo culto', exact: true }).count() === 0, 'Consulta não cria cultos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Cultos cabem no celular');
  stage = 'equipe pública';
  await page.goto(`${origin}/pessoas`);
  await page.getByRole('heading', { name: 'Nossa equipe', exact: true }).waitFor();
  expect(await page.locator('a[href^="mailto:"]').count() === 0 && await page.locator('.people-contact').count() === 0,
    'Contatos privados não aparecem na consulta');
  expect(await page.getByRole('button', { name: 'Nova pessoa', exact: true }).count() === 0, 'Consulta não cria pessoas');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Equipe cabe no celular');
  stage = 'biblioteca pública';
  await page.goto(`${origin}/musicas`);
  await page.getByRole('heading', { name: 'Biblioteca de músicas', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Nova música', exact: true }).count() === 0
    && await page.locator('.songs-row-actions button').count() === 0, 'Consulta não edita o catálogo');
  expect(await page.getByRole('button', { name: 'Importar PDFs', exact: true }).count() === 0,
    'Consulta não oferece importação de PDFs em lote');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Biblioteca cabe no celular');
  const firstSong = page.locator('.songs-name').first();
  if (await firstSong.count()) {
    stage = 'cifra e transposição públicas';
    await firstSong.click();
    const key = page.getByLabel('Tom da visualização', { exact: true });
    await key.waitFor();
    const previousKey = await key.inputValue();
    await key.selectOption(previousKey === 'C' ? 'D' : 'C');
    expect(await key.inputValue() !== previousKey
      && await page.getByRole('button', { name: 'Editar música', exact: true }).count() === 0
      && await page.getByRole('button', { name: 'Salvar tom no culto', exact: true }).count() === 0,
    'Consulta pode trocar o tom local sem editar o cadastro');
    const sourceLink = await page.getByRole('link', { name: 'Abrir Cifra Club', exact: true }).getAttribute('href');
    expect(/^https:\/\/(?:www\.)?cifraclub\.com\.br\//.test(sourceLink || ''), 'Cifra Club disponível na leitura');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Leitura cabe no celular');
    expect(!/Tom original/.test(await page.locator('.song-meta').innerText()), 'Tom interno não aparece como opção pública');
    await page.getByRole('button', { name: 'Entrar no modo leitura', exact: true }).click();
    expect(await page.getByRole('dialog', { name: /^Leitura de/ }).isVisible(), 'Modo leitura móvel disponível');
    expect(await page.evaluate(() => document.querySelector('.topbar')?.inert === true), 'Navegação de fundo não recebe foco durante leitura');
    await page.getByRole('button', { name: 'Sair do modo leitura', exact: true }).click();
    expect(await key.inputValue() !== previousKey, 'Modo leitura preserva o tom escolhido');
    transpositionChecked = true;
  }
  expect(writes.length === 0, 'Consulta não envia gravações ao banco');
  stage = 'gráficos públicos';
  await page.goto(`${origin}/graficos`);
  await page.getByRole('heading', { name: 'Gráficos', exact: true }).waitFor();
  expect(await page.getByLabel('Período das análises', { exact: true }).isVisible(), 'Gráficos publicados com filtros');
  await page.getByLabel('Período das análises', { exact: true }).selectOption('30');
  expect(await page.getByRole('region', { name: 'Resumo das análises', exact: true }).isVisible(), 'Filtros mantêm o resumo público');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Gráficos cabem em320px');
  expect(await page.locator('a[href^="mailto:"]').count() === 0
    && await page.getByRole('link', { name: 'Meu perfil', exact: true }).count() === 0, 'Consulta mantém contatos e edição do perfil privados');
  expect(writes.length === 0, 'Gráficos não enviam gravações');
  await page.setViewportSize({ width: 390, height: 844 });
  stage = 'manifest e service worker';
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    const data = await response.json();
    return { type: response.headers.get('content-type'), name: data.name, shortName: data.short_name,
      theme: data.theme_color, display: data.display, icons: data.icons.length };
  });
  expect(manifest.type?.includes('application/manifest+json') && manifest.name.includes('Candeia')
    && manifest.shortName === 'Candeia' && manifest.theme === '#171717'
    && manifest.display === 'standalone' && manifest.icons === 2, 'Manifest Candeia válido');
  stage = 'ativação do service worker';
  // waitForFunction treats a returned Promise as truthy in Playwright. Await
  // readiness inside evaluate, with a bounded deadline, before reloading.
  await page.evaluate(async () => {
    let timeout;
    try {
      await Promise.race([
        navigator.serviceWorker.ready.then(registration => new Promise(resolve => {
          const worker = registration.active;
          if (worker?.state === 'activated') resolve(true);
          else worker?.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(true); });
        })),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Service worker não ativou dentro do prazo.')), 25000); }),
      ]);
    } finally { clearTimeout(timeout); }
  });
  await page.reload();
  await page.locator('.public-banner').waitFor();
  stage = 'controle do service worker';
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    return { files: requests.length, api: requests.some(request => new URL(request.url).origin !== location.origin
      || /\/auth\/v1|\/rest\/v1|\/\.netlify\/functions\//.test(new URL(request.url).pathname)) };
  });
  expect(cache.files > 10 && !cache.api, 'Cache estático sem dados da API');
  stage = 'guia e importador atualizado';
  await page.goto(`${origin}/conectar-cifra-club`);
  await page.getByRole('heading', { name: 'Importar do Cifra Club sem copiar e colar', exact: true }).waitFor();
  expect(await page.getByRole('heading', { name: 'Importar do Cifra Club sem copiar e colar', exact: true }).isVisible(), 'Guia publicado');
  expect(await page.getByRole('heading', { name: 'Importar PDF pelo celular', exact: true }).isVisible(), 'Guia abre na importaçãoPDF');
  expect(await page.getByText('Salvar como PDF', { exact: true }).isVisible(), 'Android orienta salvarPDF');
  expect(await page.getByRole('button', { name: /Copiar favorito|Copiar script/ }).count() === 0, 'Guia móvel simplificado');
  await page.getByRole('button', { name: 'iPhone / iPad', exact: true }).click();
  expect(await page.getByText('Compartilhar → Salvar em Arquivos', { exact: true }).isVisible(), 'iPhone orienta salvarPDF');
  expect(await page.getByRole('link', { name: 'Abrir biblioteca para importar', exact: true }).getAttribute('href') === '/musicas', 'Guia aponta para biblioteca');
  await page.getByRole('tab', { name: 'Computador', exact: true }).click();
  expect(await page.getByText('Atualização 1.1.1:', { exact: true }).isVisible(), 'Guia orienta atualização do importador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Guia cabe no celular');
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar importador', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename() === 'candeia-cifraclub.zip', 'Download recebe o nome esperado');
  const downloaded = await readFile(await download.path());
  const built = await readFile(new URL('../dist/downloads/candeia-cifraclub.zip', import.meta.url));
  expect(createHash('sha256').update(downloaded).digest('hex') === createHash('sha256').update(built).digest('hex'), 'Download publicado corresponde ao pacote 1.1.1 do build');
  stage = 'leitor PDF publicado';
  const pdfAsset = (await readdir(new URL('../dist/assets/', import.meta.url))).filter(name => /^cifra-pdf-[\w-]+\.js$/.test(name) && !name.startsWith('cifra-pdf-worker-'));
  expect(pdfAsset.length === 1, 'Build tem um módulo de importação PDF');
  const cleanedInstrumental = await page.evaluate(async asset => {
    const { songFromPdfText } = await import(asset);
    // Original local text only: exercise the published parser without
    // creating a song or requesting any protected Cifra Club page.
    const text = 'Verificação instrumental\nEquipe de teste\nTom: D\n[Intro] [G] [A] [D]\n[Tab Intro]\nParte 1 de 2\ne|--0h2p0-----|\nB|--3---3-----|\nG|--2---------|\nD|--0---------|\nA|------------|\nE|------------|\n\n[Solo] [Em] [Am]\nTab - Solo\n(Parte 2 de 2)\ne|--12b(14)r12--10/12--|\nB|--10~~--------------|\nG|--------------------|\nD|--------------------|\nA|--------------------|\nE|--------------------|\n\n[G]Cantamos juntos, eu nunca estou solo';
    const source = songFromPdfText(text, 'Verificação instrumental - Equipe de teste - Cifra Club');
    return { content: source.content, key: source.originalKey };
  }, `${origin}/assets/${pdfAsset[0]}`);
  expect(cleanedInstrumental.key === 'D'
    && cleanedInstrumental.content.includes('[Intro] [G] [A] [D]')
    && cleanedInstrumental.content.includes('[Solo] [Em] [Am]')
    && cleanedInstrumental.content.includes('[G]Cantamos juntos, eu nunca estou solo')
    && !/Tab|Parte \d|[eBGDAE]\||12b/.test(cleanedInstrumental.content),
    'Importador publicado limpa tabs de intro e solo preservando acordes, letra e tom');
  const pdf = await readFile(new URL('../tests/fixtures/cifra-chart.pdf', import.meta.url));
  const parsed = await page.evaluate(async ({ asset, bytes }) => {
    const { readCifraPdf } = await import(asset);
    const source = await readCifraPdf(new File([new Uint8Array(bytes)], 'verificacao-local.pdf', { type: 'application/pdf' }));
    return { content: source.content, key: source.originalKey, title: source.title };
  }, { asset: `${origin}/assets/${pdfAsset[0]}`, bytes: [...pdf] });
  expect(parsed.key === 'G' && parsed.content.includes('[G]') && parsed.content.includes('[F#7(b9)]'), 'PDF e worker publicados extraem acordes reais');
  const workerClosedDeadline = Date.now() + 5000;
  while (page.workers().length && Date.now() < workerClosedDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  expect(page.workers().length === 0, 'Leitura publicada encerra o worker');
  const repeated = await page.evaluate(async ({ asset, bytes }) => {
    const { readCifraPdf } = await import(asset);
    const source = await readCifraPdf(new File([new Uint8Array(bytes)], 'verificacao-local-repetida.pdf', { type: 'application/pdf' }));
    return { content: source.content, key: source.originalKey, title: source.title };
  }, { asset: `${origin}/assets/${pdfAsset[0]}`, bytes: [...pdf] });
  const repeatedWorkerDeadline = Date.now() + 5000;
  while (page.workers().length && Date.now() < repeatedWorkerDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  expect(repeated.content === parsed.content && repeated.key === parsed.key && repeated.title === parsed.title
    && page.workers().length === 0, 'Leituras PDF sequenciais preservam a cifra e encerram cada worker');
  expect(writes.length === 0, 'Leitura PDF local não envia arquivo ou gravações');
  stage = 'shell offline';
  // Shared ministry data remains online-only. Test the cached login shell.
  await page.evaluate(() => sessionStorage.removeItem('candeia.public.session'));
  await context.setOffline(true);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).isVisible(), 'Shell Candeia abre offline');
  await context.setOffline(false);
  await context.close();
  console.log(JSON.stringify({ public_url: origin, passed: checks, mobile: true, readonly_public: true,
    transposition_checked: transpositionChecked, static_pwa: true, offline_login_shell: true }));
} catch (error) {
  console.error(`Verificação pública falhou: ${stage}. ${error instanceof Error && error.message.length < 80 ? error.message : 'Revise essa etapa.'}`);
  if (stage.includes('service worker') && diagnosticPage) {
    try {
      console.error(JSON.stringify(await diagnosticPage.evaluate(async () => ({
        controlled: Boolean(navigator.serviceWorker.controller),
        registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
          installing: registration.installing?.state, waiting: registration.waiting?.state, active: registration.active?.state,
        })),
        cacheEntries: (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).length)))
          .reduce((total, count) => total + count, 0),
      }))));
    } catch { /* Preserve the original stage failure without logging page data. */ }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
