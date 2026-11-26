import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';

const functionModulePath = '../../netlify/functions/notify-assignments.mjs';
let api: Awaited<ReturnType<typeof importFunction>>;
async function importFunction() {
  return await import(functionModulePath);
}

const SERVICE = '30000000-0000-4000-8000-000000000001';
const vapid = createECDH('prime256v1');
vapid.generateKeys();
const device = createECDH('prime256v1');
device.generateKeys();
const deviceAuth = randomBytes(16);
const subscription = {
  endpoint: 'https://push.example.test/send/abc',
  p256dh: device.getPublicKey().toString('base64url'),
  auth: deviceAuth.toString('base64url'),
};
const row = {
  person_id: 'p1',
  person_name: 'Ana Souza',
  functions: ['Voz', 'Teclado'],
  email: 'ana@example.test',
  subscriptions: [subscription],
  service_id: SERVICE,
  service_date: '2099-11-29',
  service_time: '19:30:00',
  service_type: 'Culto de domingo',
};
const event = (body: unknown = { serviceId: SERVICE }, method = 'POST') => ({
  httpMethod: method,
  headers: { authorization: 'Bearer local.test.signature' },
  body: JSON.stringify(body),
});
const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

/** The browser side of RFC 8291, to prove the server's message can be read. */
function decrypt(message: Buffer) {
  const salt = message.subarray(0, 16);
  const idLength = message[20];
  const serverPublic = message.subarray(21, 21 + idLength);
  const body = message.subarray(21 + idLength);
  const shared = device.computeSecret(serverPublic);
  const ikm = hmac(
    hmac(deviceAuth, shared),
    Buffer.concat([Buffer.from('WebPush: info\0'), device.getPublicKey(), serverPublic, Buffer.from([1])]),
  );
  const prk = hmac(salt, ikm);
  const decipher = createDecipheriv(
    'aes-128-gcm',
    hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16),
    hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12),
  );
  decipher.setAuthTag(body.subarray(-16));
  const plain = Buffer.concat([decipher.update(body.subarray(0, -16)), decipher.final()]);
  expect(plain.at(-1)).toBe(2);
  return plain.subarray(0, -1).toString();
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'public-test-key');
  vi.stubEnv('VAPID_PUBLIC_KEY', vapid.getPublicKey().toString('base64url'));
  vi.stubEnv('VAPID_PRIVATE_KEY', vapid.getPrivateKey().toString('base64url'));
  vi.stubEnv('VAPID_SUBJECT', 'mailto:lider@example.test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('BREVO_API_KEY', '');
  vi.stubEnv('NOTIFY_EMAIL_FROM', 'Candeia <escala@example.test>');
  vi.stubEnv('URL', 'https://louvor.example.test');
  api = await importFunction();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('avisos de escala por e-mail e notificação', () => {
  it('criptografa a notificação de forma que só o aparelho inscrito consegue ler', () => {
    const message = api.encryptPushPayload('{"title":"Nova escala"}', subscription);
    expect(message.readUInt32BE(16)).toBe(4096);
    expect(decrypt(message)).toBe('{"title":"Nova escala"}');
    expect(() => api.encryptPushPayload('x', { ...subscription, p256dh: 'curta' })).toThrow();
  });

  it('assina o VAPID com a chave do servidor e o endereço do serviço de push', () => {
    const header = api.vapidAuthorization(subscription.endpoint, api.vapidKeys(), Date.UTC(2099, 0, 1));
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(key).toBe(vapid.getPublicKey().toString('base64url'));
    const [head, claims, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      aud: 'https://push.example.test',
      exp: Date.UTC(2099, 0, 1) / 1000 + 43200,
      sub: 'mailto:lider@example.test',
    });
    const publicKey = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: vapid.getPublicKey().subarray(1, 33).toString('base64url'),
        y: vapid.getPublicKey().subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('monta o texto com primeiro nome, dia, horário, funções e link do culto', () => {
    const content = api.noticeContent({ ...row, person_name: '<Ana> Souza' }, 'https://louvor.example.test');
    expect(content.subject).toBe('Você foi escalado(a): Culto de domingo, domingo, 29/11 às 19:30');
    expect(content.text).toContain('como Voz e Teclado');
    expect(content.text).toContain(`https://louvor.example.test/cultos/${SERVICE}`);
    expect(content.html).toContain('&lt;Ana&gt;');
    expect(content.push).toEqual({
      title: 'Nova escala no Candeia',
      body: 'Culto de domingo · domingo, 29/11 às 19:30 · Voz e Teclado',
      url: `/cultos/${SERVICE}`,
    });
  });

  it('entrega a chave pública e recusa pedidos sem sessão ou sem culto antes de qualquer envio', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(JSON.parse((await api.handler({ httpMethod: 'GET', headers: {} })).body)).toEqual({
      publicKey: vapid.getPublicKey().toString('base64url'),
    });
    expect((await api.handler({ ...event(), headers: {} })).statusCode).toBe(401);
    expect((await api.handler(event({ serviceId: 'x' }))).statusCode).toBe(400);
    expect((await api.handler(event(undefined, 'PUT'))).statusCode).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('não marca ninguém como avisado enquanto e-mail e notificação não estão configurados', async () => {
    for (const name of ['VAPID_PUBLIC_KEY', 'RESEND_API_KEY']) vi.stubEnv(name, '');
    vi.resetModules();
    api = await importFunction();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(JSON.parse((await api.handler(event())).body)).toEqual({ emails: 0, pushes: 0, configured: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('só líderes enviam: o Supabase decide e a recusa vira 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: '42501' }), { status: 400 })));
    expect((await api.handler(event())).statusCode).toBe(403);
  });

  it('envia um e-mail e uma notificação por pessoa e esquece aparelhos que não existem mais', async () => {
    const gone = { ...subscription, endpoint: 'https://push.example.test/send/old' };
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith('/rpc/claim_assignment_notifications'))
          return new Response(
            JSON.stringify([
              { ...row, subscriptions: [subscription, gone] },
              { ...row, person_name: 'Bia', email: '', subscriptions: [] },
            ]),
            { status: 200 },
          );
        if (url.endsWith('/send/old')) return new Response('', { status: 410 });
        return new Response('{}', { status: 201 });
      }),
    );
    expect(JSON.parse((await api.handler(event())).body)).toEqual({ emails: 1, pushes: 1, configured: true });
    const claim = calls.find(call => call.url.endsWith('/rpc/claim_assignment_notifications'))!;
    expect((claim.init.headers as Record<string, string>).Authorization).toBe('Bearer local.test.signature');
    expect(JSON.parse(String(claim.init.body))).toEqual({ p_service_id: SERVICE });
    const email = calls.find(call => call.url === 'https://api.resend.com/emails')!;
    expect(JSON.parse(String(email.init.body))).toMatchObject({ from: 'Candeia <escala@example.test>', to: ['ana@example.test'] });
    const push = calls.find(call => call.url === subscription.endpoint)!;
    expect(JSON.parse(decrypt(push.init.body as Buffer))).toEqual({
      title: 'Nova escala no Candeia',
      body: 'Culto de domingo · domingo, 29/11 às 19:30 · Voz e Teclado',
      url: `/cultos/${SERVICE}`,
    });
    const forget = calls.find(call => call.url.endsWith('/rpc/forget_push_subscriptions'))!;
    expect(JSON.parse(String(forget.init.body))).toEqual({ p_endpoints: [gone.endpoint] });
  });

  it('usa o Brevo quando ele está configurado, para quem não tem domínio próprio', async () => {
    vi.stubEnv('BREVO_API_KEY', 'xkeysib-test');
    vi.stubEnv('NOTIFY_EMAIL_FROM', 'lider@gmail.test');
    vi.resetModules();
    api = await importFunction();
    expect(api.emailProvider()).toEqual({ kind: 'brevo', key: 'xkeysib-test', sender: { name: 'Candeia', email: 'lider@gmail.test' } });
  });
  it('avisa quem sugeriu quando a sugestão é aprovada, só por notificação e uma vez', async () => {
    const SUGGESTION = '40000000-0000-4000-8000-000000000001';
    const SONG = '50000000-0000-4000-8000-000000000001';
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith('/rpc/claim_suggestion_approval_notification'))
          return new Response(
            JSON.stringify([{ suggestion_id: SUGGESTION, title: 'Bondade de Deus', author_name: 'Ana', song_id: SONG, subscriptions: [subscription] }]),
            { status: 200 },
          );
        return new Response('{}', { status: 201 });
      }),
    );
    expect(JSON.parse((await api.handler(event({ suggestionId: SUGGESTION }))).body)).toEqual({ pushes: 1, configured: true });
    const claim = calls.find(call => call.url.endsWith('/rpc/claim_suggestion_approval_notification'))!;
    expect(JSON.parse(String(claim.init.body))).toEqual({ p_suggestion_id: SUGGESTION });
    expect(calls.some(call => call.url.includes('resend') || call.url.includes('brevo'))).toBe(false);
    const push = calls.find(call => call.url === subscription.endpoint)!;
    expect(JSON.parse(decrypt(push.init.body as Buffer))).toEqual({
      title: 'Sua sugestão foi aprovada',
      body: '"Bondade de Deus" entrou na Biblioteca do Candeia. Obrigado pela sugestão!',
      url: `/musicas/${SONG}`,
    });
  });

  it('não envia o aviso de sugestão sem as chaves de notificação, e recusa quem não é líder', async () => {
    const SUGGESTION = '40000000-0000-4000-8000-000000000001';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: '42501' }), { status: 400 })));
    expect((await api.handler(event({ suggestionId: SUGGESTION }))).statusCode).toBe(403);
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    vi.resetModules();
    api = await importFunction();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(JSON.parse((await api.handler(event({ suggestionId: SUGGESTION }))).body)).toEqual({ pushes: 0, configured: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
