/**
 * Live Auth/PostgREST/RLS smoke test. Disposable accounts and fixtures only.
 * SUPABASE_ACCESS_TOKEN stays in memory and curl's stdin, never argv or logs.
 * No authentication settings, owner account, or migrations are changed.
 */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const netlifyStatePath = '/workspace/scratch/louvor-netlify-state.json';

async function verifiedBrowserOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/') throw new Error();
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return url.origin;
  if (url.protocol !== 'https:') throw new Error();
  // The deployment helper writes only public metadata observed in Netlify's
  // authenticated API responses. Never send a temporary login to another URL.
  const state = JSON.parse(await readFile(netlifyStatePath, 'utf8'));
  const observed = new URL(state.url);
  if (state.state !== 'ready' || !/^[a-z0-9-]{1,128}$/i.test(state.site_id || '')
    || !/^[a-z0-9-]{1,128}$/i.test(state.deploy_id || '')
    || observed.protocol !== 'https:' || observed.username || observed.password
    || observed.search || observed.hash || observed.pathname !== '/'
    || url.origin !== observed.origin) throw new Error();
  return url.origin;
}

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const checkBrowser = process.argv.includes('--browser');
let browserOrigin;
if (checkBrowser) {
  try {
    browserOrigin = await verifiedBrowserOrigin(process.env.LOUVOR_BROWSER_URL || 'http://127.0.0.1:5173');
  } catch {
    console.error('LOUVOR_BROWSER_URL deve ser uma origem HTTP(S) de loopback ou a origem HTTPS do deploy Netlify ready observado no estado local. Nenhuma alteração foi feita.');
    process.exit(1);
  }
}
if (!/^[a-z]{20}$/.test(projectRef)) {
  console.error('SUPABASE_PROJECT_REF deve ter 20 letras. Nenhuma alteração foi feita.');
  process.exit(1);
}
if (!managementToken || /[\r\n]/.test(managementToken)) {
  console.error('Configure SUPABASE_ACCESS_TOKEN de forma segura. Nenhuma alteração foi feita.');
  process.exit(1);
}

const managementBase = `https://api.supabase.com/v1/projects/${projectRef}`;
const projectBase = `https://${projectRef}.supabase.co`;
const curlEnvironment = { ...process.env };
delete curlEnvironment.SUPABASE_ACCESS_TOKEN;
const marker = `codex-verification-${randomUUID().slice(0, 8)}`;
const fixtures = {
  tag: randomUUID(), deniedTag: randomUUID(), person: randomUUID(),
  songA: randomUUID(), songB: randomUUID(), service: randomUUID(),
  assignment: randomUUID(), firstItem: randomUUID(), secondItem: randomUUID(),
  missingTag: randomUUID(), missingSong: randomUUID(),
};
const accounts = ['admin', 'leader', 'musician'].map(role => ({
  role, email: `${marker}-${role}@example.invalid`, password: randomBytes(32).toString('base64url'),
  id: undefined, accessToken: undefined,
}));
let anonymousKey;
let serviceKey;
let started = false;
let verified = 0;
let failure;
let cleaned = false;

function expect(condition, message) {
  if (!condition) throw new Error(`Verificação falhou: ${message}`);
  verified++;
}

function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('A API não retornou um identificador válido para a conta temporária.');
  }
  return value;
}

const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlList = values => values.map(sqlString).join(',');

async function request(base, path, { method = 'GET', bearer, apiKey, body, headers = [] } = {}) {
  // Both origins are constructed above, never accepted from remote responses.
  if (![managementBase, projectBase].includes(base) || !path.startsWith('/')) {
    throw new Error('Destino de verificação inválido.');
  }
  const config = [
    `url = ${JSON.stringify(base + path)}`,
    `request = ${JSON.stringify(method)}`,
    'header = "Accept: application/json"',
    'header = "Content-Type: application/json"',
    ...(bearer ? [`header = ${JSON.stringify(`Authorization: Bearer ${bearer}`)}`] : []),
    ...(apiKey ? [`header = ${JSON.stringify(`apikey: ${apiKey}`)}`] : []),
    ...headers.map(header => `header = ${JSON.stringify(header)}`),
    ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return await new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(`Falha de transporte na verificação de ${method} ${path.split('?')[0]}. Nenhuma credencial foi exibida.`));
        return;
      }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      const payload = stdout.slice(0, separator).trim();
      try {
        resolve({ status, data: payload ? JSON.parse(payload) : null });
      } catch {
        reject(new Error(`Resposta inesperada na verificação de ${method} ${path.split('?')[0]} (HTTP ${status}).`));
      }
    });
    child.stdin.end(config);
  });
}

function success(response, operation) {
  if (!(response.status >= 200 && response.status < 300)) {
    throw new Error(`Falha em ${operation} (HTTP ${response.status}). Nenhuma resposta sensível foi exibida.`);
  }
  return response.data;
}

function rejected(response, code, operation) {
  expect(response.status >= 400 && response.status < 500 && response.data?.code === code, operation);
}

async function query(sql) {
  const response = await request(managementBase, '/database/query', {
    method: 'POST', bearer: managementToken, body: { query: sql },
  });
  const data = success(response, 'SQL administrativo de verificação');
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.result)) return data.result;
  throw new Error('A API não retornou linhas SQL no formato esperado.');
}

const rest = (account, path, options = {}) => request(projectBase, '/rest/v1/' + path, {
  ...options, apiKey: anonymousKey, bearer: account?.accessToken ?? anonymousKey,
});

async function read(account, table, filter = '') {
  const data = success(await rest(account, `${table}?select=*&${filter}`), `leitura de ${table}`);
  if (!Array.isArray(data)) throw new Error('Formato de leitura inesperado.');
  return data;
}

async function rpc(account, name, body) {
  return await rest(account, `rpc/${name}`, { method: 'POST', body });
}

async function login(account) {
  const response = await request(projectBase, '/auth/v1/token?grant_type=password', {
    method: 'POST', apiKey: anonymousKey, bearer: anonymousKey,
    body: { email: account.email, password: account.password },
  });
  const session = success(response, 'login da conta temporária');
  if (session?.user?.id !== account.id || typeof session?.access_token !== 'string' || !session.access_token) {
    throw new Error('A sessão da conta temporária não corresponde ao cadastro criado.');
  }
  account.accessToken = session.access_token;
}

const songA = {
  id: fixtures.songA, title: `${marker} — música A`, artist: 'Verificação temporária',
  originalKey: 'C', churchKey: 'D', content: '[C]Texto original de verificação.',
  youtubeUrl: '', notes: 'Registro temporário; removido ao finalizar.', tagIds: [fixtures.tag],
};
const songB = { ...songA, id: fixtures.songB, title: `${marker} — música B`, originalKey: 'G', churchKey: 'A' };
const service = {
  id: fixtures.service, date: '2099-01-01', time: '19:00', type: 'Especial', notes: marker,
  assignments: [{ id: fixtures.assignment, personId: fixtures.person, function: 'Voz' }],
  repertoire: [
    { id: fixtures.firstItem, songId: fixtures.songB, key: 'Eb', notes: 'Primeira' },
    { id: fixtures.secondItem, songId: fixtures.songA, key: 'F#', notes: 'Segunda' },
  ],
};

async function verifyBrowser(admin, musician) {
  let browser;
  let stage = 'inicialização';
  let apiDiagnostic = '';
  const safeNetworkFailures = new Set();
  const previousDebug = process.env.DEBUG;
  const previousPlaywrightDebug = process.env.PWDEBUG;
  // Playwright debug logs can include text passed to fill(), so disable those
  // before importing it. This direct API does not load the test-runner config.
  delete process.env.DEBUG;
  delete process.env.PWDEBUG;
  try {
    const { chromium } = await import('playwright');
    const browserEnvironment = Object.fromEntries(Object.entries(curlEnvironment)
      .filter(([name]) => !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE/i.test(name)));
    delete browserEnvironment.DEBUG;
    delete browserEnvironment.PWDEBUG;
    let proxy;
    const proxyValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxyValue) {
      const proxyUrl = new URL(proxyValue);
      if (!['http:', 'https:'].includes(proxyUrl.protocol)) throw new Error('Proxy incompatível.');
      proxy = {
        server: proxyUrl.origin, bypass: '127.0.0.1,localhost,[::1]',
        ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
        ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
      };
    }
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'],
      env: browserEnvironment, ...(proxy ? { proxy } : {}),
    });
    for (const account of [admin, musician]) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        page.on('requestfailed', request => {
          const code = request.failure()?.errorText.match(/net::[A-Z_]+/)?.[0];
          try {
            const host = new URL(request.url()).hostname;
            if (code && /^(?:[a-z0-9.-]+|\[::1\])$/i.test(host)) safeNetworkFailures.add(`${host} ${code}`);
          } catch { /* Never log a raw request URL or failure message. */ }
        });
        page.setDefaultTimeout(25_000);
        page.setDefaultNavigationTimeout(25_000);
        stage = `login de ${account.role}`;
        await page.goto(browserOrigin);
        if (new URL(page.url()).origin !== browserOrigin) throw new Error('Redirecionamento inesperado.');
        await page.getByLabel('E-mail', { exact: true }).fill(account.email);
        await page.getByLabel('Senha', { exact: true }).fill(account.password);
        await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).click();
        await page.getByRole('heading', { name: /^Olá,/ }).waitFor({ state: 'visible' });

        stage = `biblioteca de ${account.role}`;
        await page.goto(`${browserOrigin}/musicas`);
        const row = page.getByRole('article').filter({ hasText: songA.title });
        await row.waitFor({ state: 'visible' });
        const rowText = await row.textContent();
        expect(await row.count() === 1 && rowText?.includes('Original: C')
          && await row.locator('.songs-key-badge').textContent() === 'D'
          && await page.getByRole('button', { name: 'Nova música', exact: true }).count() === (account.role === 'admin' ? 1 : 0)
          && await page.locator('.demo-banner').count() === 0,
        `interface ${account.role} usa músicas e permissões reais do adaptador`);

        stage = `culto de ${account.role}`;
        await page.goto(`${browserOrigin}/cultos/${fixtures.service}`);
        await page.getByRole('heading', { name: 'Especial', exact: true }).waitFor({ state: 'visible' });
        const setlist = page.locator('.service-setlist > li');
        await setlist.first().waitFor({ state: 'visible' });
        const firstText = await setlist.first().textContent();
        const lastText = await setlist.last().textContent();
        const teamText = await page.locator('.service-team-list').textContent();
        expect(await setlist.count() === 2 && firstText?.includes(songB.title) && firstText.includes('Tom Eb')
          && lastText?.includes(songA.title) && lastText.includes('Tom F#') && teamText?.includes(marker) && teamText.includes('Voz')
          && await page.getByRole('button', { name: 'Editar culto', exact: true }).count() === (account.role === 'admin' ? 1 : 0),
        `interface ${account.role} mostra ordem, tons, equipe e permissão do culto real`);
      } finally {
        await context.close().catch(() => {});
      }
    }

    stage = 'geração do link de recuperação da conta temporária';
    const recoveryRedirect = `${browserOrigin}/redefinir-senha`;
    // Match the official Auth client's options.redirectTo mapping. This admin
    // endpoint generates a link only; it does not send an email.
    const recovery = success(await request(projectBase,
      `/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(recoveryRedirect)}`, {
        method: 'POST', apiKey: serviceKey, bearer: serviceKey,
        body: { type: 'recovery', email: musician.email, redirectTo: recoveryRedirect },
      }), 'geração de recuperação sem envio de e-mail');
    const recoveryLink = new URL(recovery.action_link);
    expect(recovery.id === musician.id && recovery.email === musician.email
      && recovery.verification_type === 'recovery' && recovery.redirect_to === recoveryRedirect
      && recoveryLink.origin === projectBase && recoveryLink.pathname === '/auth/v1/verify'
      && !recoveryLink.username && !recoveryLink.password && !recoveryLink.hash
      && recoveryLink.searchParams.get('type') === 'recovery'
      && Boolean(recoveryLink.searchParams.get('token'))
      && recoveryLink.searchParams.get('redirect_to') === recoveryRedirect,
    'link de recuperação pertence somente à conta temporária e ao callback validado');
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await recoveryContext.newPage();
      page.on('requestfailed', request => {
        const code = request.failure()?.errorText.match(/net::[A-Z_]+/)?.[0];
        try {
          const host = new URL(request.url()).hostname;
          if (code && /^(?:[a-z0-9.-]+|\[::1\])$/i.test(host)) safeNetworkFailures.add(`${host} ${code}`);
        } catch { /* Never log the recovery link, query, or fragment. */ }
      });
      page.setDefaultTimeout(25_000);
      page.setDefaultNavigationTimeout(25_000);
      stage = 'callback público de recuperação';
      await page.goto(recoveryLink.href);
      const callback = new URL(page.url());
      expect(callback.origin === browserOrigin && callback.pathname === '/redefinir-senha',
        'recuperação retorna à origem e à rota esperadas');
      await page.getByRole('heading', { name: 'Redefinir senha', exact: true }).waitFor({ state: 'visible' });
      await page.getByLabel('Nova senha', { exact: true }).waitFor({ state: 'visible' });
      const previousPassword = musician.password;
      const nextPassword = randomBytes(32).toString('base64url');
      stage = 'redefinição da senha temporária pelo formulário';
      await page.getByLabel('Nova senha', { exact: true }).fill(nextPassword);
      await page.getByLabel('Confirmar senha', { exact: true }).fill(nextPassword);
      await page.getByRole('button', { name: 'Salvar senha', exact: true }).click();
      await page.getByText('Sua senha foi atualizada.', { exact: true }).waitFor({ state: 'visible' });
      stage = 'validação da senha temporária nova';
      musician.password = nextPassword;
      const nextLogin = await request(projectBase, '/auth/v1/token?grant_type=password', {
        method: 'POST', apiKey: anonymousKey, bearer: anonymousKey,
        body: { email: musician.email, password: nextPassword },
      });
      apiDiagnostic = `HTTP ${nextLogin.status}`;
      const nextErrorCode = nextLogin.data?.code || nextLogin.data?.error_code;
      if (/^[a-z_]{1,60}$/.test(nextErrorCode || '')) apiDiagnostic += ` (${nextErrorCode})`;
      const nextSession = success(nextLogin, 'login da conta temporária após recuperação');
      if (nextSession.user?.id !== musician.id || typeof nextSession.access_token !== 'string') {
        throw new Error('A nova sessão não corresponde à conta temporária.');
      }
      musician.accessToken = nextSession.access_token;
      apiDiagnostic = '';
      expect(Boolean(musician.accessToken), 'nova senha autentica a mesma conta temporária');
      stage = 'rejeição da senha temporária anterior';
      const previousLogin = await request(projectBase, '/auth/v1/token?grant_type=password', {
        method: 'POST', apiKey: anonymousKey, bearer: anonymousKey,
        body: { email: musician.email, password: previousPassword },
      });
      apiDiagnostic = `HTTP ${previousLogin.status}`;
      // Unversioned GoTrue uses error_code, unlike PostgREST's code field.
      const previousErrorCode = typeof previousLogin.data?.code === 'string'
        ? previousLogin.data.code : previousLogin.data?.error_code;
      if (/^[a-z_]{1,60}$/.test(previousErrorCode || '')) apiDiagnostic += ` (${previousErrorCode})`;
      expect(previousLogin.status >= 400 && previousLogin.status < 500 && previousErrorCode === 'invalid_credentials',
        'senha anterior da conta temporária não autentica mais');
      apiDiagnostic = '';
    } finally {
      await recoveryContext.close().catch(() => {});
    }
  } catch {
    // Never propagate a Playwright call log: failed fill() calls may include a
    // temporary password. A stage name is sufficient to diagnose this test.
    const network = [...safeNetworkFailures].slice(0, 4).join('; ');
    throw new Error(`A verificação de navegador falhou na etapa ${stage}.${apiDiagnostic ? ` API: ${apiDiagnostic}.` : ''}${network ? ` Rede: ${network}.` : ''} Nenhuma senha, captura ou trace foi exibido.`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (previousDebug === undefined) delete process.env.DEBUG; else process.env.DEBUG = previousDebug;
    if (previousPlaywrightDebug === undefined) delete process.env.PWDEBUG; else process.env.PWDEBUG = previousPlaywrightDebug;
  }
}

try {
  const keyResponse = await request(managementBase, '/api-keys', { bearer: managementToken });
  const keys = success(keyResponse, 'obtenção de chaves somente na memória');
  anonymousKey = Array.isArray(keys) ? keys.find(key => key.name === 'anon')?.api_key : undefined;
  serviceKey = Array.isArray(keys) ? keys.find(key => key.name === 'service_role')?.api_key : undefined;
  if (!anonymousKey || !serviceKey) throw new Error('As chaves necessárias à verificação não estão disponíveis.');

  rejected(await rest(null, 'songs?select=id'), '42501', 'anônimo não lê músicas');
  started = true;
  for (const account of accounts) {
    const response = await request(projectBase, '/auth/v1/admin/users', {
      method: 'POST', apiKey: serviceKey, bearer: serviceKey,
      body: {
        email: account.email, password: account.password, email_confirm: true,
        user_metadata: { name: marker, role: 'admin', approved: true },
      },
    });
    const user = success(response, 'criação da conta temporária');
    if (user?.email?.toLowerCase() !== account.email) throw new Error('Cadastro temporário retornou um e-mail inesperado.');
    account.id = uuid(user.id);
    await login(account);
  }
  const [admin, leader, musician] = accounts;
  const profiles = await query(`select id, role, approved from public.profiles where id in (${sqlList(accounts.map(account => account.id))})`);
  expect(profiles.length === 3 && profiles.every(profile => profile.role === 'musician' && profile.approved === false),
    'gatilho ignora papel/aprovação enviados em metadados');
  const pendingProfiles = await read(musician, 'profiles');
  expect(pendingProfiles.length === 1 && pendingProfiles[0].id === musician.id && pendingProfiles[0].approved === false,
    'conta pendente consulta somente o próprio perfil');
  expect((await read(musician, 'songs')).length === 0 && (await read(musician, 'people')).length === 0,
    'conta pendente não lê dados do ministério');
  rejected(await rpc(musician, 'save_song', { p_song: { ...songA, tagIds: [] } }), '42501', 'conta pendente não salva músicas');
  rejected(await rpc(musician, 'save_service', { p_service: service }), '42501', 'conta pendente não salva cultos');
  rejected(await rest(musician, `profiles?id=eq.${musician.id}`, {
    method: 'PATCH', body: { role: 'admin', approved: true, person_id: null },
  }), '42501', 'conta não modifica diretamente permissões/vínculo do próprio perfil');

  const promoted = await query(`update public.profiles set role = 'admin', approved = true where id = ${sqlString(admin.id)} returning id, role, approved`);
  expect(promoted.length === 1 && promoted[0].id === admin.id && promoted[0].role === 'admin' && promoted[0].approved,
    'bootstrap administrativo atinge somente a conta temporária');
  for (const account of [leader, musician]) {
    success(await rpc(admin, 'update_profile', {
      p_profile: { id: account.id, name: marker, role: account.role, approved: true, personId: null },
    }), 'aprovação da conta temporária pelo administrador');
  }
  const approvedProfiles = await read(admin, 'profiles', `id=in.(${leader.id},${musician.id})`);
  expect(approvedProfiles.length === 2 && approvedProfiles.every(profile => profile.approved) && approvedProfiles.some(profile => profile.role === 'leader'),
    'administrador aprova e define papéis pelo RPC');

  success(await rest(admin, 'tags', {
    method: 'POST', headers: ['Prefer: return=representation'],
    body: { id: fixtures.tag, name: marker, color: '#552288' },
  }), 'cadastro de etiqueta temporária');
  success(await rest(admin, 'people', {
    method: 'POST', headers: ['Prefer: return=representation'],
    body: { id: fixtures.person, name: marker, email: '', functions: ['Voz', 'Violão'] },
  }), 'cadastro de pessoa temporária');
  success(await rpc(admin, 'save_song', { p_song: songA }), 'cadastro da música A');
  success(await rpc(admin, 'save_song', { p_song: songB }), 'cadastro da música B');
  const links = await read(admin, 'song_tags', `song_id=in.(${fixtures.songA},${fixtures.songB})`);
  expect(links.length === 2 && links.every(link => link.tag_id === fixtures.tag), 'músicas e etiquetas persistidas no banco real');

  rejected(await rest(leader, 'tags', {
    method: 'POST', body: { id: fixtures.deniedTag, name: `${marker}-negada`, color: '#552288' },
  }), '42501', 'líder não cadastra etiquetas');
  rejected(await rpc(leader, 'save_song', { p_song: songA }), '42501', 'líder não altera catálogo');
  success(await rpc(leader, 'save_service', { p_service: service }), 'planejamento do culto pelo líder');
  const repertoire = await read(musician, 'repertoire', `service_id=eq.${fixtures.service}&order=position.asc`);
  const assignments = await read(musician, 'assignments', `service_id=eq.${fixtures.service}`);
  expect(repertoire.length === 2 && repertoire[0].song_id === fixtures.songB && repertoire[0].position === 0
    && repertoire[0].key === 'Eb' && repertoire[1].song_id === fixtures.songA && repertoire[1].key === 'F#',
  'músico lê repertório ordenado com tons específicos do culto');
  expect(assignments.length === 1 && assignments[0].person_id === fixtures.person && assignments[0].function === 'Voz',
    'músico lê a escala salva pelo líder');
  const storedSongs = await read(musician, 'songs', `id=in.(${fixtures.songA},${fixtures.songB})`);
  expect(storedSongs.length === 2 && storedSongs.find(song => song.id === fixtures.songA)?.church_key === 'D'
    && storedSongs.find(song => song.id === fixtures.songB)?.church_key === 'A', 'tons do repertório preservam o cadastro das músicas');
  rejected(await rpc(musician, 'save_song', { p_song: songA }), '42501', 'músico aprovado não altera músicas');
  rejected(await rpc(musician, 'save_service', { p_service: service }), '42501', 'músico aprovado não altera planejamento');
  rejected(await rpc(musician, 'update_profile', {
    p_profile: { id: musician.id, name: marker, role: 'admin', approved: true, personId: fixtures.person },
  }), '42501', 'músico não promove ou vincula o próprio perfil');

  rejected(await rest(admin, `songs?id=eq.${fixtures.songA}`, { method: 'DELETE' }), '23503', 'música em repertório não pode ser excluída');
  rejected(await rest(admin, `people?id=eq.${fixtures.person}`, { method: 'DELETE' }), '23503', 'pessoa escalada não pode ser excluída');
  rejected(await rest(admin, `people?id=eq.${fixtures.person}`, { method: 'PATCH', body: { functions: ['Violão'] } }),
    '23514', 'função em uso não pode ser removida');
  rejected(await rpc(admin, 'save_song', {
    p_song: { ...songA, title: `${marker} — alteração inválida`, tagIds: [fixtures.missingTag] },
  }), '23503', 'etiqueta inexistente rejeita agregado');
  const preservedSong = await read(musician, 'songs', `id=eq.${fixtures.songA}`);
  const preservedTags = await read(musician, 'song_tags', `song_id=eq.${fixtures.songA}`);
  expect(preservedSong[0]?.title === songA.title && preservedTags.length === 1 && preservedTags[0].tag_id === fixtures.tag,
    'falha no vínculo desfaz alteração de música e etiquetas');
  rejected(await rpc(leader, 'save_service', {
    p_service: { ...service, notes: 'Alteração inválida', repertoire: [{ ...service.repertoire[0], songId: fixtures.missingSong }] },
  }), '23503', 'música inexistente rejeita planejamento');
  const preservedServices = await read(musician, 'services', `id=eq.${fixtures.service}`);
  const preservedRepertoire = await read(musician, 'repertoire', `service_id=eq.${fixtures.service}&order=position.asc`);
  const preservedAssignments = await read(musician, 'assignments', `service_id=eq.${fixtures.service}`);
  expect(preservedServices[0]?.notes === marker && preservedRepertoire.length === 2 && preservedAssignments.length === 1,
    'falha de planejamento preserva culto, ordem, repertório e escala');

  const administrators = await query("select count(*)::integer as n from public.profiles where role = 'admin' and approved");
  if (administrators[0]?.n === 1) {
    rejected(await rpc(admin, 'update_profile', {
      p_profile: { id: admin.id, name: marker, role: 'musician', approved: true, personId: null },
    }), '23514', 'último administrador aprovado não pode ser rebaixado');
  }
  if (checkBrowser) await verifyBrowser(admin, musician);
  success(await rpc(admin, 'update_profile', {
    p_profile: { id: musician.id, name: marker, role: 'musician', approved: false, personId: null },
  }), 'revogação da aprovação temporária');
  expect((await read(musician, 'songs', `id=eq.${fixtures.songA}`)).length === 0,
    'revogar aprovação bloqueia consultas mesmo com sessão existente');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Falha na verificação real.';
} finally {
  if (started) {
    try {
      try {
        await query(`begin;
          delete from public.services where id = ${sqlString(fixtures.service)};
          delete from public.songs where id in (${sqlList([fixtures.songA, fixtures.songB])});
          delete from public.tags where id in (${sqlList([fixtures.tag, fixtures.deniedTag])});
          delete from public.people where id = ${sqlString(fixtures.person)};
          commit;`);
      } catch { /* Still remove the disposable accounts and verify every table. */ }
      // Query by exact generated emails also finds a user created before a
      // transport failure prevented its ID from being captured locally.
      let temporaryUsers;
      try {
        temporaryUsers = await query(`select id from auth.users where email in (${sqlList(accounts.map(account => account.email))})`);
      } catch {
        temporaryUsers = accounts.filter(account => account.id).map(account => ({ id: account.id }));
      }
      for (const user of temporaryUsers) {
        const id = uuid(user.id);
        let removed = false;
        try {
          const response = await request(projectBase, `/auth/v1/admin/users/${id}`, {
            method: 'DELETE', apiKey: serviceKey, bearer: serviceKey,
          });
          removed = (response.status >= 200 && response.status < 300) || response.status === 404;
        } catch { /* Fall back to management SQL after an Auth transport failure. */ }
        if (!removed) {
          // Management SQL is an independent cleanup route, restricted to the
          // exact UUID and generated email of this disposable account.
          try {
            await query(`delete from auth.users where id = ${sqlString(id)} and email in (${sqlList(accounts.map(account => account.email))}) returning id`);
          } catch { /* Continue independent cleanup; the final count must pass. */ }
        }
      }
      const remaining = await query(`select
        (select count(*) from auth.users where email in (${sqlList(accounts.map(account => account.email))}))
        + (select count(*) from public.services where id = ${sqlString(fixtures.service)})
        + (select count(*) from public.songs where id in (${sqlList([fixtures.songA, fixtures.songB])}))
        + (select count(*) from public.tags where id in (${sqlList([fixtures.tag, fixtures.deniedTag])}))
        + (select count(*) from public.people where id = ${sqlString(fixtures.person)}) as n`);
      cleaned = Number(remaining[0]?.n) === 0;
      if (!cleaned) throw new Error('A limpeza não confirmou a remoção de todos os registros temporários.');
    } catch {
      failure = `${failure ? failure + ' ' : ''}A limpeza não pôde ser confirmada; revise os registros de verificação temporários no projeto.`;
    }
  }
  for (const account of accounts) { account.password = ''; account.accessToken = undefined; }
  anonymousKey = undefined;
  serviceKey = undefined;
}

if (failure) {
  console.error(`${verified} verificações concluídas. ${cleaned ? 'Dados e contas temporários removidos.' : started ? 'Limpeza exige revisão.' : 'Nenhuma conta temporária criada.'}`);
  console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`${verified} verificações do Supabase real passaram. Dados e contas temporários removidos; credenciais não foram gravadas ou exibidas.`);
}
