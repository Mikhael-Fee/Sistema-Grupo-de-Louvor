/**
 * NETLIFY ready metadata is the sole source of the public application URL.
 * Inject SUPABASE_ACCESS_TOKEN securely; it is used in curl's stdin only.
 * node scripts/configure-public-site.mjs           (read-only check)
 * node scripts/configure-public-site.mjs --apply   (update the two URL fields)
 * node scripts/configure-public-site.mjs --approve-owner (approve confirmed owner)
 * Existing redirect rules and other Auth settings are preserved. The owner
 * lookup reports only account/profile status. Approval requires --approve-owner
 * and the exact owner email already confirmed in Auth. No account, password or
 * email is created or sent by this helper.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const approveOwner = args.includes('--approve-owner');
const apiBase = `https://api.supabase.com/v1/projects/${projectRef}`;
const ownerEmail = 'mikhaelfernandes8@gmail.com';
const curlEnvironment = { ...process.env };
delete curlEnvironment.SUPABASE_ACCESS_TOKEN;

if (args.some(arg => !['--apply', '--approve-owner'].includes(arg))) {
  console.error('Use --apply ou --approve-owner. Nenhuma alteração foi feita.');
  process.exit(1);
}

if (!/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token)) {
  console.error('Configure o projeto e SUPABASE_ACCESS_TOKEN de forma segura. Nenhuma alteração foi feita.');
  process.exit(1);
}

async function api(path, method = 'GET', body) {
  const config = [
    `url = ${JSON.stringify(apiBase + path)}`,
    `request = ${JSON.stringify(method)}`,
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Accept: application/json"',
    'header = "Content-Type: application/json"',
    ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return await new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error(`Falha de transporte ao verificar ${method} ${path}. Nenhuma credencial foi exibida.`)); return; }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      if (!(status >= 200 && status < 300)) {
        reject(new Error(`A API não aceitou ${method} ${path} (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); return;
      }
      try { resolve(JSON.parse(stdout.slice(0, separator))); }
      catch { reject(new Error('A API retornou um formato inesperado. Nenhuma resposta sensível foi exibida.')); }
    });
    child.stdin.end(config);
  });
}

function redirectRules(value) {
  if (typeof value === 'string') return value.split(',').map(rule => rule.trim()).filter(Boolean);
  if (value == null) return [];
  throw new Error('Formato inesperado das regras de redirecionamento; nenhuma lista foi substituída.');
}

try {
  let saved;
  try { saved = JSON.parse(await readFile('/workspace/scratch/louvor-netlify-state.json', 'utf8')); }
  catch { throw new Error('Leia um snapshot Netlify válido antes de configurar as URLs de Auth.'); }
  let productionUrl;
  try {
    const url = new URL(saved.url);
    if (saved.state !== 'ready' || !saved.site_id || !saved.deploy_id || url.protocol !== 'https:'
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    productionUrl = url.origin;
  } catch { throw new Error('O snapshot precisa indicar deploy ready e URL pública HTTPS observada pela API Netlify.'); }

  const current = await api('/config/auth');
  const existing = redirectRules(current.uri_allow_list);
  const required = [
    `${productionUrl}/**`, 'http://localhost:5173/**', 'http://127.0.0.1:5173/**',
    'http://localhost:4173/**', 'http://127.0.0.1:4173/**',
  ];
  const merged = [...new Set([...existing, ...required])];
  if (apply && (current.site_url !== productionUrl || required.some(rule => !existing.includes(rule)))) {
    await api('/config/auth', 'PATCH', { site_url: productionUrl, uri_allow_list: merged.join(',') });
  }
  const verified = apply ? await api('/config/auth') : current;
  const actualRules = redirectRules(verified.uri_allow_list);
  const configured = verified.site_url === productionUrl && merged.every(rule => actualRules.includes(rule));
  if (apply && !configured) throw new Error('A leitura após PATCH não confirmou a URL e todas as regras preservadas.');
  for (const key of ['external_email_enabled', 'mailer_autoconfirm', 'disable_signup', 'security_captcha_enabled',
    'smtp_host', 'smtp_user', 'smtp_pass', 'smtp_admin_email', 'smtp_port', 'smtp_sender_name']) {
    if (apply && JSON.stringify(current[key]) !== JSON.stringify(verified[key])) {
      throw new Error('Uma configuração de Auth além das URLs mudou durante a verificação; revise o painel.');
    }
  }

  if (approveOwner) {
    const promotion = await api('/database/query', 'POST', { query: `
      with confirmed_owner as (
        select id from auth.users
        where lower(email) = lower('${ownerEmail}')
          and email_confirmed_at is not null
      )
      update public.profiles
      set role = 'admin', approved = true
      where id = (select id from confirmed_owner)
        and (select count(*) from confirmed_owner) = 1
      returning role, approved
    ` });
    const promoted = Array.isArray(promotion) ? promotion : promotion?.result;
    if (!Array.isArray(promoted) || promoted.length !== 1 || promoted[0].role !== 'admin' || promoted[0].approved !== true) {
      throw new Error('Não foi possível aprovar uma única conta confirmada do proprietário. Confirme o cadastro antes de prosseguir.');
    }
  }

  const lookup = await api('/database/query', 'POST', { query: `
    with owner_account as (
      select id, email_confirmed_at from auth.users
      where lower(email) = lower('${ownerEmail}') limit 1
    )
    select exists(select 1 from owner_account) as account_exists,
      coalesce((select email_confirmed_at is not null from owner_account), false) as email_confirmed,
      exists(select 1 from public.profiles where id in (select id from owner_account)) as profile_exists,
      (select role from public.profiles where id in (select id from owner_account)) as role,
      (select approved from public.profiles where id in (select id from owner_account)) as approved,
      (select count(*)::integer from public.profiles where role = 'admin' and approved) as approved_administrators
  ` });
  const rows = Array.isArray(lookup) ? lookup : lookup?.result;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('A consulta mínima da conta não retornou o formato esperado.');
  const owner = rows[0];
  console.log(JSON.stringify({
    production_url: productionUrl, configured, applied: apply, owner_approval_requested: approveOwner,
    redirect_rules: actualRules.length,
    owner: {
      account_exists: Boolean(owner.account_exists), email_confirmed: Boolean(owner.email_confirmed),
      profile_exists: Boolean(owner.profile_exists),
      role: ['admin', 'leader', 'musician'].includes(owner.role) ? owner.role : null,
      approved: owner.approved === null ? null : Boolean(owner.approved),
    },
    approved_administrators: Number(owner.approved_administrators),
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao verificar configuração de produção.');
  process.exitCode = 1;
}
