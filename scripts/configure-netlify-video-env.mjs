/** Read-only by default. --apply binds only the existing public Supabase
 * configuration to this site's builds/functions. No admin token is published.
 */
import { execFile } from 'node:child_process';

const apply = process.argv.length === 3 && process.argv[2] === '--apply';
if (process.argv.length > 2 && !apply) throw new Error('Use somente --apply.');
const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID || '93f0134d-7c6f-414a-b86a-1c4c9bdcb477';
const publicConfig = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL?.trim(),
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY?.trim(),
};
if (!token || /[\r\n]/.test(token) || !/^[a-z0-9-]+$/i.test(siteId)) throw new Error('Configure o acesso Netlify com segurança.');
if (publicConfig.VITE_SUPABASE_URL !== 'https://fxebsycpbybhzkpnxzoo.supabase.co' || !publicConfig.VITE_SUPABASE_ANON_KEY) throw new Error('Confira as variáveis públicas do projeto existente.');
const key = publicConfig.VITE_SUPABASE_ANON_KEY;
if (!key.startsWith('sb_publishable_')) {
  try {
    if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error();
  } catch { throw new Error('A configuração deve usar somente uma chave pública anon/publishable.'); }
}
const curlEnv = { ...process.env }; delete curlEnv.NETLIFY_AUTH_TOKEN; delete curlEnv.SUPABASE_ACCESS_TOKEN;
async function api(path, method = 'GET', body) {
  const config = [`url = ${JSON.stringify('https://api.netlify.com/api/v1' + path)}`, `request = ${JSON.stringify(method)}`,
    `header = ${JSON.stringify('Authorization: Bearer ' + token)}`, 'header = "Content-Type: application/json"',
    ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`])].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['--silent', '--show-error', '--max-time', '30', '--write-out', '\n%{http_code}', '--config', '-'],
      { env: curlEnv, maxBuffer: 2_097_152 }, (error, stdout) => {
        const separator = stdout.lastIndexOf('\n'), status = Number(stdout.slice(separator + 1));
        if (error || status < 200 || status >= 300) return reject(new Error(`Configuração Netlify recusada (HTTP ${status || 'indisponível'}).`));
        try { resolve(JSON.parse(stdout.slice(0, separator) || 'null')); } catch { reject(new Error('Resposta inesperada da configuração Netlify.')); }
      });
    child.stdin.end(config);
  });
}
try {
  const site = await api(`/sites/${siteId}`);
  if (site.name !== 'louvor-grupo-fxebsy' || !/^[a-z0-9-]+$/i.test(site.account_id || '')) throw new Error('A configuração não corresponde ao site Candeia existente.');
  const endpoint = `/accounts/${site.account_id}/env`;
  const query = `?site_id=${siteId}`;
  let variables = await api(endpoint + query);
  if (!Array.isArray(variables)) throw new Error('Formato inesperado das variáveis Netlify.');
  const configured = variable => variable && ['builds', 'functions'].every(scope => variable.scopes?.includes(scope))
    && ['all', 'production'].every(context => {
      const entry = variable.values?.find(value => value.context === context) || variable.values?.find(value => value.context === 'all');
      return entry?.value === publicConfig[variable.key];
    });
  const changed = [];
  for (const [name, value] of Object.entries(publicConfig)) {
    const current = variables.find(variable => variable.key === name);
    if (configured(current)) continue;
    if (apply) {
      // Keep other deploy contexts and scopes, updating this site's two public
      // values for production and fallback. Never modify unrelated variables.
      const values = (current?.values || []).map(entry => ['all', 'production'].includes(entry.context) ? { ...entry, value } : entry);
      if (!values.some(entry => entry.context === 'all')) values.push({ context: 'all', value });
      // Explicit scope selection is a paid-plan feature. An omitted scope on
      // creation uses Netlify's all-scope default, including functions/builds.
      const body = { key: name, values, is_secret: false,
        ...(current?.scopes?.includes('builds') && current.scopes.includes('functions') ? { scopes: current.scopes } : {}) };
      if (current) await api(`${endpoint}/${name}${query}`, 'PUT', body);
      else await api(endpoint + query, 'POST', [body]);
      changed.push(name);
    }
  }
  if (apply) variables = await api(endpoint + query);
  const state = Object.fromEntries(Object.keys(publicConfig).map(name => [name, configured(variables.find(variable => variable.key === name)) === true]));
  if (apply && Object.values(state).some(value => !value)) throw new Error('A conferência das variáveis públicas não passou.');
  console.log(JSON.stringify({ public_supabase_variables_ready: Object.values(state).every(Boolean), variables: state, changed, private_credentials_published: false }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha na configuração Netlify.'); process.exitCode = 1;
}
