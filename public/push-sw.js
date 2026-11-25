// Loaded by the app's service worker (workbox importScripts): shows scale notices.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(self.registration.showNotification(String(data.title || 'Candeia'), {
    body: String(data.body || 'Você tem uma novidade na escala.'), icon: '/pwa-192.png', badge: '/pwa-192.png', tag: url, data: { url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) return open.focus().then(client => client.navigate ? client.navigate(target) : client);
    return self.clients.openWindow(target);
  }));
});
