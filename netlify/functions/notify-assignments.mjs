// Tell people they were added to a scale: one e-mail and one phone notification per person.
// Supabase decides who is new (claim_assignment_notifications), so the caller must be a
// leader or administrator and nothing is sent twice. Standalone: no npm imports, because
// the direct deployment helper bundles one .mjs per function.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;

function supabaseConfiguration() {
  const value = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || !key || /[\r\n]/.test(key)) return null;
    return { origin: url.origin, key };
  } catch { return null; }
}

const fromB64 = value => Buffer.from(value, 'base64url');
const clean = value => String(value ?? '').trim();

export function vapidKeys() {
  const publicKey = clean(process.env.VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey) || fromB64(publicKey).length !== 65 || fromB64(privateKey).length !== 32) return null;
  const subject = clean(process.env.VAPID_SUBJECT) || 'mailto:avisos@candeia.invalid';
  return { publicKey, privateKey, subject: /^(mailto:|https:\/\/)/.test(subject) ? subject : `mailto:${subject}` };
}

export function emailProvider() {
  const brevo = clean(process.env.BREVO_API_KEY);
  const resend = clean(process.env.RESEND_API_KEY);
  const from = clean(process.env.NOTIFY_EMAIL_FROM);
  const match = /^(?:(.{1,80}?)\s*<)?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/.exec(from);
  if (!match || /[\r\n]/.test(brevo + resend)) return null;
  const sender = { name: clean(match[1]) || 'Candeia', email: match[2] };
  if (brevo) return { kind: 'brevo', key: brevo, sender };
  if (resend) return { kind: 'resend', key: resend, sender };
  return null;
}

/** VAPID (RFC 8292): proves to the push service that this server owns the public key. */
export function vapidAuthorization(endpoint, keys, now = Date.now()) {
  const publicKey = fromB64(keys.publicKey);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: publicKey.subarray(1, 33).toString('base64url'), y: publicKey.subarray(33, 65).toString('base64url') }, format: 'jwk' });
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`;
}

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** Message encryption for Web Push (RFC 8291, aes128gcm), one record. */
export function encryptPushPayload(payload, subscription, serverKeys, salt = randomBytes(16)) {
  if (!serverKeys) { serverKeys = createECDH('prime256v1'); serverKeys.generateKeys(); }
  const userPublic = fromB64(subscription.p256dh);
  const authSecret = fromB64(subscription.auth);
  if (userPublic.length !== 65 || authSecret.length < 16) throw new Error('subscription-keys');
  const serverPublic = serverKeys.getPublicKey();
  const shared = serverKeys.computeSecret(userPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), userPublic, serverPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = serverPublic.length;
  return Buffer.concat([header, serverPublic, body]);
}

function serviceWhen(row) {
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${row.service_date}T12:00:00Z`));
  const time = /^\d{2}:\d{2}/.exec(clean(row.service_time))?.[0];
  return time ? `${date} às ${time}` : date;
}
const joinList = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function noticeContent(row, siteUrl) {
  const firstName = clean(row.person_name).split(/\s+/)[0] || 'Olá';
  const functions = joinList((row.functions || []).map(clean).filter(Boolean));
  const when = serviceWhen(row);
  const type = clean(row.service_type) || 'culto';
  const link = `${siteUrl}/cultos/${row.service_id}`;
  const subject = `Você foi escalado(a): ${type}, ${when}`;
  const text = `${firstName}, você foi escalado(a) para ${type}, ${when}, como ${functions}.\n\nConfirme sua presença no Candeia: ${link}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#171717;max-width:520px">
<p>${escapeHtml(firstName)}, você foi escalado(a) para <b>${escapeHtml(type)}</b>.</p>
<p>📅 ${escapeHtml(when)}<br>🎵 ${escapeHtml(functions)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Confirmar presença</a></p>
<p style="color:#666;font-size:13px">Se não puder servir nesse dia, abra o link e toque em "Não poderei".</p></div>`;
  return { subject, text, html, push: { title: 'Nova escala no Candeia', body: `${type} · ${when} · ${functions}`, url: `/cultos/${row.service_id}` } };
}

async function sendEmail(provider, to, content) {
  const request = provider.kind === 'brevo'
    ? { url: 'https://api.brevo.com/v3/smtp/email', headers: { 'api-key': provider.key }, body: { sender: provider.sender, to: [{ email: to }], subject: content.subject, htmlContent: content.html, textContent: content.text } }
    : { url: 'https://api.resend.com/emails', headers: { Authorization: `Bearer ${provider.key}` }, body: { from: `${provider.sender.name} <${provider.sender.email}>`, to: [to], subject: content.subject, html: content.html, text: content.text } };
  const response = await fetch(request.url, { method: 'POST', headers: { ...request.headers, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(8_000) });
  return response.ok;
}

/** Returns 'sent', 'gone' (device no longer accepts) or 'failed'. */
async function sendPush(keys, subscription, payload) {
  let url;
  try { url = new URL(subscription.endpoint); } catch { return 'gone'; }
  if (url.protocol !== 'https:' || url.username || url.password) return 'gone';
  const response = await fetch(url, { method: 'POST', headers: { Authorization: vapidAuthorization(url.href, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' }, body: encryptPushPayload(JSON.stringify(payload), subscription), redirect: 'error', signal: AbortSignal.timeout(8_000) });
  if (response.status === 404 || response.status === 410) return 'gone';
  return response.ok ? 'sent' : 'failed';
}

async function rpc(config, token, name, body) {
  return fetch(`${config.origin}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(6_000) });
}

function siteAddress() {
  for (const value of [process.env.PUBLIC_SITE_URL, process.env.URL]) {
    try { const url = new URL(clean(value)); if (url.protocol === 'https:') return url.origin; } catch { /* next */ }
  }
  return 'https://louvor-grupo-fxebsy.netlify.app';
}

export async function handler(event) {
  const keys = vapidKeys();
  if (event.httpMethod === 'GET') return reply(200, { publicKey: keys?.publicKey || null });
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método não permitido.' });
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
  if (!token || token.length > 4096) return reply(401, { error: 'Entre na sua conta para enviar avisos.' });
  let serviceId;
  try { serviceId = JSON.parse(event.body || '{}')?.serviceId; } catch { /* below */ }
  if (typeof serviceId !== 'string' || !UUID.test(serviceId)) return reply(400, { error: 'Informe o culto.' });
  const config = supabaseConfiguration();
  const provider = emailProvider();
  // Nothing is claimed while no channel is set up, so the notices wait for the configuration.
  if (!config || (!provider && !keys)) return reply(200, { emails: 0, pushes: 0, configured: false });
  let rows;
  try {
    const response = await rpc(config, token, 'claim_assignment_notifications', { p_service_id: serviceId });
    if (response.status === 401 || response.status === 403) return reply(403, { error: 'Apenas líderes e administradores enviam avisos de escala.' });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      if (failure?.code === '42501') return reply(403, { error: 'Apenas líderes e administradores enviam avisos de escala.' });
      throw new Error('claim');
    }
    rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('claim');
  } catch { return reply(503, { error: 'Não foi possível preparar os avisos agora.' }); }
  const site = siteAddress();
  let emails = 0; let pushes = 0; const gone = [];
  await Promise.all(rows.slice(0, 60).map(async row => {
    const content = noticeContent(row, site);
    const email = clean(row.email);
    if (provider && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      try { if (await sendEmail(provider, email, content)) emails++; } catch { /* other people still get theirs */ }
    }
    if (keys) for (const subscription of Array.isArray(row.subscriptions) ? row.subscriptions.slice(0, 10) : []) {
      try {
        const result = await sendPush(keys, subscription, content.push);
        if (result === 'sent') pushes++; else if (result === 'gone') gone.push(subscription.endpoint);
      } catch { /* a broken device never blocks the others */ }
    }
  }));
  if (gone.length) await rpc(config, token, 'forget_push_subscriptions', { p_endpoints: gone }).catch(() => null);
  return reply(200, { emails, pushes, configured: true });
}
