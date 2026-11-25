import { supabase } from './backend';

const FUNCTION_URL = '/.netlify/functions/notify-assignments';

export type PushState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

export function isIos(userAgent = navigator.userAgent): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration('/');
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await (await registration())?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

async function serverKey(): Promise<string> {
  const response = await fetch(FUNCTION_URL, { headers: { Accept: 'application/json' } }).catch(() => null);
  const body = await response?.json().catch(() => null);
  if (typeof body?.publicKey !== 'string') throw new Error('As notificações ainda não foram configuradas no servidor. Avise um administrador.');
  return body.publicKey;
}

export async function enablePush(): Promise<void> {
  if (!supported() || !supabase) throw new Error('Este navegador não recebe notificações.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('As notificações foram bloqueadas. Libere nas configurações do navegador para este site.');
  const worker = await registration() ?? await navigator.serviceWorker.ready;
  const key = await serverKey();
  let subscription = await worker.pushManager.getSubscription();
  if (!subscription) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const json = subscription.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth });
  if (error) throw new Error(error.message || 'Não foi possível ativar as notificações.');
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  if (supabase) await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

/** Asks the server to tell newly scheduled people. Never blocks or fails the save. */
export async function notifyNewAssignments(serviceId: string): Promise<void> {
  try {
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
    if (!token) return;
    await fetch(FUNCTION_URL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ serviceId }) });
  } catch { /* the notice is a convenience; the scale is already saved */ }
}
