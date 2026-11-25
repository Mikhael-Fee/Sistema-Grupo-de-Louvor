import { describe, expect, it } from 'vitest';
import { isIos, urlBase64ToUint8Array } from './push-notifications';

describe('notificações no aparelho', () => {
  it('converte a chave pública do servidor para o formato do navegador', () => {
    const key = Buffer.from(Uint8Array.from({ length: 65 }, (_, index) => index * 3)).toString('base64url');
    expect(Array.from(urlBase64ToUint8Array(key))).toEqual(Array.from({ length: 65 }, (_, index) => (index * 3) % 256));
  });
  it('reconhece iPhone para explicar que é preciso instalar o app', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });
});
