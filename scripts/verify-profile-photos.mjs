/**
 * Live avatar/Auth/Storage/RLS checks using two disposable accounts only.
 * Inject SUPABASE_ACCESS_TOKEN securely. Keys/passwords stay in memory and
 * curl stdin; temporary files contain test images only, with mode0600.
 * No owner account, Auth setting, migration or existing ministry data changes.
 */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
if (process.argv.length !== 2 || !/^[a-z]{20}$/.test(projectRef) || !managementToken || /[\r\n]/.test(managementToken)) {
  console.error('Configure SUPABASE_ACCESS_TOKEN de forma segura; este script não recebe argumentos. Nenhuma alteração foi feita.');
  process.exit(1);
}
const managementBase = `https://api.supabase.com/v1/projects/${projectRef}`;
const projectBase = `https://${projectRef}.supabase.co`;
const curlEnvironment = { ...process.env };
for (const name of Object.keys(curlEnvironment)) {
  if (/TOKEN|PASSWORD|SECRET|SERVICE_ROLE/i.test(name)) delete curlEnvironment[name];
}
const marker = `codex-photo-check-${randomUUID().slice(0, 8)}`;
const personId = randomUUID();
const accounts = ['admin', 'musician'].map(role => ({
  role, email: `${marker}-${role}@example.invalid`, password: randomBytes(32).toString('base64url'),
  id: undefined, accessToken: undefined,
}));
// Known-valid, one-pixel PNG. Oversized fixture uses this image plus padding.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
let anonymousKey;
let serviceKey;
let imageDirectory;
let started = false;
let cleaned = false;
let checks = 0;
let failure;
const paths = new Set();
const temporaryIds = new Set();

function expect(condition, description) {
  if (!condition) throw new Error(`Verificação falhou: ${description}`);
  checks++;
}
const uuid = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('A API não retornou um UUID válido para a conta temporária.');
  }
  return value.toLowerCase();
};
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlList = values => values.map(quote).join(',');

async function request(base, path, { method = 'GET', bearer, apiKey, body, file, contentType = 'application/json', raw = false, headers = [] } = {}) {
  if (![managementBase, projectBase].includes(base) || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Destino inválido para a verificação de fotos.');
  }
  const config = [
    `url = ${JSON.stringify(base + path)}`, `request = ${JSON.stringify(method)}`,
    'header = "Accept: application/json"', `header = ${JSON.stringify(`Content-Type: ${contentType}`)}`,
    ...(bearer ? [`header = ${JSON.stringify(`Authorization: Bearer ${bearer}`)}`] : []),
    ...(apiKey ? [`header = ${JSON.stringify(`apikey: ${apiKey}`)}`] : []),
    ...headers.map(header => `header = ${JSON.stringify(header)}`),
    ...(file ? [`data-binary = ${JSON.stringify(`@${file}`)}`] : body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, encoding: 'buffer', maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error(`Falha de transporte em ${method} ${path.split('?')[0]}. Nenhuma credencial foi exibida.`)); return; }
      const separator = stdout.lastIndexOf(10);
      const status = Number(stdout.subarray(separator + 1).toString('utf8'));
      const payload = stdout.subarray(0, separator);
      if (raw) { resolve({ status, data: payload }); return; }
      const json = payload.toString('utf8').trim();
      try { resolve({ status, data: json ? JSON.parse(json) : null }); }
      catch { reject(new Error(`Resposta inesperada em ${method} ${path.split('?')[0]} (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); }
    });
    child.stdin.end(config);
  });
}
const accepted = response => response.status >= 200 && response.status < 300;
const refused = response => response.status >= 400 && response.status < 500;
function success(response, description) {
  if (!accepted(response)) throw new Error(`Falha em ${description} (HTTP ${response.status}). Nenhuma resposta sensível foi exibida.`);
  return response.data;
}
async function query(sql) {
  const result = success(await request(managementBase, '/database/query', {
    method: 'POST', bearer: managementToken, body: { query: sql },
  }), 'SQL de verificação temporária');
  const rows = Array.isArray(result) ? result : result?.result;
  if (!Array.isArray(rows)) throw new Error('Formato inesperado da verificação SQL.');
  return rows;
}
const rest = (account, path, options = {}) => request(projectBase, `/rest/v1/${path}`, {
  ...options, apiKey: anonymousKey, bearer: account?.accessToken ?? anonymousKey,
});
const rpc = (account, photoUrl) => rest(account, 'rpc/update_my_profile_photo', {
  method: 'POST', body: { p_photo_url: photoUrl },
});
const publicUrl = path => `${projectBase}/storage/v1/object/public/avatars/${path}`;
function newPath(account) {
  const path = `${account.id}/${randomUUID()}.png`;
  paths.add(path);
  return path;
}
const upload = (account, path, file, mime = 'image/png') => request(projectBase, `/storage/v1/object/avatars/${path}`, {
  method: 'POST', apiKey: anonymousKey, bearer: account.accessToken, file, contentType: mime,
  headers: ['x-upsert: false'],
});
const remove = (account, names) => request(projectBase, '/storage/v1/object/avatars', {
  method: 'DELETE', apiKey: account ? anonymousKey : serviceKey,
  bearer: account?.accessToken ?? serviceKey, body: { prefixes: names },
});
async function ownProfile(account) {
  const rows = success(await rest(account, `profiles?select=id,name,role,approved,person_id,photo_url&id=eq.${account.id}`), 'leitura do perfil temporário');
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Formato inesperado do perfil temporário.');
  return rows[0];
}

try {
  const keys = success(await request(managementBase, '/api-keys', { bearer: managementToken }), 'chaves somente em memória');
  anonymousKey = Array.isArray(keys) ? keys.find(key => key.name === 'anon')?.api_key : undefined;
  serviceKey = Array.isArray(keys) ? keys.find(key => key.name === 'service_role')?.api_key : undefined;
  if (!anonymousKey || !serviceKey || /[\r\n]/.test(anonymousKey + serviceKey)) throw new Error('As chaves de verificação não estão disponíveis.');
  const schema = await query(`select to_regprocedure('public.update_my_profile_photo(text)') is not null as ready,
    to_regprocedure('public.read_team_profile_photos()') is not null as linked_ready,
    exists(select 1 from storage.buckets where id='avatars' and public and file_size_limit=2097152) as bucket_ready`);
  if (!schema[0]?.ready || !schema[0]?.linked_ready || !schema[0]?.bucket_ready) throw new Error('As migrações004/005 precisam estar instaladas antes da verificação.');
  imageDirectory = await mkdtemp(join(tmpdir(), 'candeia-photo-check-'));
  const pngFile = join(imageDirectory, 'pixel.png');
  const svgFile = join(imageDirectory, 'rejected.svg');
  const oversizedFile = join(imageDirectory, 'oversized.png');
  await Promise.all([
    writeFile(pngFile, png, { mode: 0o600 }),
    writeFile(svgFile, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', { mode: 0o600 }),
    writeFile(oversizedFile, Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]), { mode: 0o600 }),
  ]);
  started = true;
  for (const account of accounts) {
    const user = success(await request(projectBase, '/auth/v1/admin/users', {
      method: 'POST', apiKey: serviceKey, bearer: serviceKey,
      body: { email: account.email, password: account.password, email_confirm: true,
        user_metadata: { name: marker, role: 'admin', approved: true } },
    }), 'criação de conta descartável sem e-mail');
    if (user?.email?.toLowerCase() !== account.email) throw new Error('O cadastro descartável retornou uma conta inesperada.');
    account.id = uuid(user.id); temporaryIds.add(account.id);
    const session = success(await request(projectBase, '/auth/v1/token?grant_type=password', {
      method: 'POST', apiKey: anonymousKey, bearer: anonymousKey,
      body: { email: account.email, password: account.password },
    }), 'login da conta descartável');
    if (session?.user?.id !== account.id || typeof session?.access_token !== 'string') throw new Error('A sessão não corresponde à conta descartável.');
    account.accessToken = session.access_token;
  }
  const [admin, musician] = accounts;
  const initial = await query(`select id,role,approved,photo_url from public.profiles where id in (${sqlList([...temporaryIds])})`);
  expect(initial.length === 2 && initial.every(row => row.role === 'musician' && !row.approved && row.photo_url === ''), 'metadados não alteram aprovação/papel/foto inicial');
  await query(`update public.profiles set approved=true,
    role=case when id=${quote(admin.id)} then 'admin' else 'musician' end
    where id in (${sqlList([...temporaryIds])})`);

  const musicianPath = newPath(musician);
  success(await upload(musician, musicianPath, pngFile), 'upload da própria foto PNG');
  success(await rpc(musician, publicUrl(musicianPath)), 'salvar própria foto');
  const profile = await ownProfile(musician);
  const authUser = success(await request(projectBase, '/auth/v1/user', {
    apiKey: anonymousKey, bearer: musician.accessToken,
  }), 'consulta da própria conta Auth');
  expect(profile.photo_url === publicUrl(musicianPath) && profile.id === musician.id
    && profile.name === marker && profile.role === 'musician' && profile.approved === true
    && profile.person_id === null && authUser?.id === musician.id && authUser.role === 'authenticated',
  'foto própria persiste sem mudar identidade, papel, aprovação ou vínculo');

  const crossPath = newPath(admin);
  const crossUpload = await upload(musician, crossPath, pngFile);
  const crossRpc = await rpc(musician, publicUrl(crossPath));
  expect(refused(crossUpload) && refused(crossRpc), 'músico não envia nem usa uma foto no diretório de outra conta');
  const deniedPerson = await rest(musician, 'people', {
    method: 'POST', body: { id: personId, name: marker, email: '', functions: ['Voz'], photo_url: publicUrl(musicianPath) },
  });
  expect(refused(deniedPerson), 'músico não cria nem altera foto de integrante');

  const svg = await upload(musician, newPath(musician), svgFile, 'image/svg+xml');
  const wrongMime = await upload(musician, newPath(musician), pngFile, 'application/octet-stream');
  expect(refused(svg) && refused(wrongMime), 'Storage rejeita SVG e MIME não permitido em caminhos próprios válidos');
  expect(refused(await upload(musician, newPath(musician), oversizedFile)), 'Storage rejeita imagem maior que 2 MiB');
  const download = await request(projectBase, `/storage/v1/object/public/avatars/${musicianPath}`, { raw: true });
  expect(download.status === 200 && download.data.equals(png), 'foto pública baixa os bytes PNG originais sem sessão');
  success(await rpc(musician, ''), 'retirar foto própria antes de excluir o arquivo');
  success(await remove(musician, [musicianPath]), 'remover próprio arquivo sem referência');
  const removed = await query(`select count(*)::integer as n from storage.objects where bucket_id='avatars' and name=${quote(musicianPath)}`);
  // Public CDN invalidation may lag. Confirm removal through Storage's backing
  // records after its real DELETE API succeeded, without requiring cache purge.
  expect((await ownProfile(musician)).photo_url === '' && Number(removed[0]?.n) === 0, 'limpar própria foto permite remover arquivo real');

  const personPath = newPath(admin);
  success(await upload(admin, personPath, pngFile), 'upload administrativo da foto da equipe');
  const people = success(await rest(admin, 'people', {
    method: 'POST', headers: ['Prefer: return=representation'],
    body: { id: personId, name: marker, email: '', functions: ['Voz'], photo_url: publicUrl(personPath) },
  }), 'cadastro de integrante descartável com foto');
  expect(Array.isArray(people) && people.length === 1 && people[0].id === personId
    && people[0].photo_url === publicUrl(personPath), 'admin aprovado salva foto da equipe no banco real');

  const linkedPath = newPath(musician);
  success(await upload(musician, linkedPath, pngFile), 'upload da foto própria para testar o vínculo');
  success(await rpc(musician, publicUrl(linkedPath)), 'foto própria antes do vínculo');
  const link = async (person, approved = true) => success(await rest(admin, 'rpc/update_profile', {
    method: 'POST', body: { p_profile: { id: musician.id, name: marker, role: 'musician', approved, personId: person } },
  }), 'atualizar somente o perfil descartável');
  const teamPhotos = async actor => success(await rest(actor, 'rpc/read_team_profile_photos', { method: 'GET' }), 'ler fotos vinculadas da equipe pelo mesmo método do aplicativo');
  await link(personId);
  const linkedRows = await teamPhotos(musician);
  const linked = linkedRows.find(row => row.personId === personId);
  expect(linked?.photoUrl === publicUrl(linkedPath)
    && Object.keys(linked).sort().join(',') === 'personId,photoUrl', 'conta aprovada vinculada fornece somente foto e ID da pessoa');
  const linkedProfile = await ownProfile(musician);
  expect(linkedProfile.person_id === personId && linkedProfile.photo_url === publicUrl(linkedPath)
    && linkedProfile.role === 'musician' && linkedProfile.approved,
  'vínculo preserva foto própria, papel e aprovação');
  expect(refused(await rest(null, 'rpc/read_team_profile_photos', { method: 'POST', body: {} })), 'visitante não executa RPC privada de fotos de contas');
  const publicEnabled = success(await rest(null, 'rpc/get_public_access', { method: 'POST', body: {} }), 'verificação da consulta pública sem alterar configuração');
  const publicResponse = await rest(null, 'rpc/read_public_ministry', { method: 'POST', body: {} });
  if (publicEnabled) {
    const publicPerson = success(publicResponse, 'consulta pública de fotos vinculadas').people.find(person => person.id === personId);
    expect(publicPerson?.photoUrl === publicUrl(personPath) && publicPerson?.accountPhotoUrl === publicUrl(linkedPath)
      && publicPerson.email === '' && Object.keys(publicPerson).sort().join(',') === 'accountPhotoUrl,email,functions,id,name,photoUrl',
    'consulta pública recebe fotos da pessoa e conta vinculada sem contatos ou campos de perfil');
  } else expect(refused(publicResponse), 'consulta pública desligada mantém fotos vinculadas privadas');
  await link(personId, false);
  expect(refused(await rest(musician, 'rpc/read_team_profile_photos', { method: 'POST', body: {} })), 'conta suspensa não consulta fotos da equipe');
  expect(!(await teamPhotos(admin)).some(row => row.personId === personId), 'revogar aprovação remove a foto vinculada da equipe');
  if (publicEnabled) {
    const revokedPerson = success(await rest(null, 'rpc/read_public_ministry', { method: 'POST', body: {} }), 'consulta após revogação').people.find(person => person.id === personId);
    expect(!revokedPerson.accountPhotoUrl && revokedPerson.photoUrl === publicUrl(personPath), 'revogação pública remove selfie e conserva foto explícita da pessoa');
  }
  await link(null);
  expect(!(await teamPhotos(admin)).some(row => row.personId === personId)
    && (await ownProfile(musician)).person_id === null, 'desvincular conta remove foto da equipe sem apagar selfie');
  success(await rpc(musician, ''), 'retirar selfie descartável após testar o vínculo');
  success(await remove(musician, [linkedPath]), 'limpeza da selfie usada no vínculo');
  success(await rest(admin, `people?id=eq.${personId}`, {
    method: 'PATCH', body: { photo_url: '' },
  }), 'desvincular foto do integrante descartável');
  success(await remove(admin, [personPath]), 'remover arquivo administrativo sem referência');
  const personRemoved = await query(`select count(*)::integer as n from storage.objects where bucket_id='avatars' and name=${quote(personPath)}`);
  expect(Number(personRemoved[0]?.n) === 0, 'admin remove arquivo de equipe após desvincular sua referência');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Falha na verificação real de fotos.';
} finally {
  if (started) {
    try {
      // Exact generated emails also recover IDs after a creation transport error.
      let users;
      try { users = await query(`select id from auth.users where email in (${sqlList(accounts.map(a => a.email))})`); }
      catch { users = [...temporaryIds].map(id => ({ id })); }
      for (const user of users) temporaryIds.add(uuid(user.id));
      const ids = [...temporaryIds];
      try {
        await query(`begin;
          ${ids.length ? `update public.profiles set photo_url='',person_id=null where id in (${sqlList(ids)});` : ''}
          delete from public.people where id=${quote(personId)} and name=${quote(marker)};
          commit;`);
      } catch { /* Independent Storage and account cleanup must still run. */ }
      if (ids.length) {
        try {
          const objects = await query(`select name from storage.objects where bucket_id='avatars'
            and split_part(name,'/',1) in (${sqlList(ids)})`);
          for (const object of objects) {
            if (typeof object.name === 'string' && ids.includes(object.name.split('/')[0])) paths.add(object.name);
          }
        } catch { /* Every attempted object path is already captured locally. */ }
      }
      if (paths.size) {
        try { success(await remove(null, [...paths]), 'limpeza dos objetos descartáveis'); }
        catch { /* Do not delete Storage metadata through SQL or orphan bytes. */ }
      }
      for (const id of ids) {
        let removed = false;
        try {
          const response = await request(projectBase, `/auth/v1/admin/users/${id}`, {
            method: 'DELETE', apiKey: serviceKey, bearer: serviceKey,
          });
          removed = accepted(response) || response.status === 404;
        } catch { /* Management SQL is an independent account cleanup route. */ }
        if (!removed) {
          try {
            await query(`delete from auth.users where id=${quote(id)} and email in (${sqlList(accounts.map(a => a.email))})`);
          } catch { /* The final count exposes incomplete cleanup. */ }
        }
      }
      const remaining = await query(`select
        (select count(*) from auth.users where email in (${sqlList(accounts.map(a => a.email))}))
        + (select count(*) from public.people where id=${quote(personId)} and name=${quote(marker)})
        ${ids.length ? `+ (select count(*) from public.profiles where id in (${sqlList(ids)}))` : ''}
        + (select count(*) from storage.objects where bucket_id='avatars'
          ${paths.size ? `and name in (${sqlList([...paths])})` : 'and false'}) as n`);
      cleaned = Number(remaining[0]?.n) === 0;
      if (!cleaned) throw new Error('A limpeza das fotos descartáveis não pôde ser confirmada.');
    } catch {
      failure = `${failure ? failure + ' ' : ''}A limpeza precisa de revisão dos identificadores temporários.`;
    }
  }
  if (imageDirectory) await rm(imageDirectory, { recursive: true, force: true }).catch(() => {});
  for (const account of accounts) { account.password = ''; account.accessToken = undefined; }
  anonymousKey = undefined; serviceKey = undefined;
}
if (failure) {
  console.error(`${checks} verificações concluídas. ${cleaned ? 'Fotos, pessoa e contas descartáveis removidas.' : started ? 'Limpeza exige revisão.' : 'Nenhuma conta descartável criada.'}`);
  console.error(failure);
  if (started && !cleaned) console.error(JSON.stringify({ person_id: personId, account_ids: [...temporaryIds], object_paths: [...paths] }));
  process.exitCode = 1;
} else {
  console.log(`${checks} verificações reais de fotos passaram. Fotos, pessoa e contas descartáveis removidas; nenhuma credencial foi gravada ou exibida.`);
}
