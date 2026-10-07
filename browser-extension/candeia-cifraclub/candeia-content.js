(function connectCandeia() {
  'use strict';
  const CHANNEL = 'candeia-cifraclub';
  const ORIGIN = 'https://louvor-grupo-fxebsy.netlify.app';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (window.top !== window || location.origin !== ORIGIN) return;

  function validRequest(message) {
    return message && typeof message === 'object' && message.channel === CHANNEL && message.version === 1
      && ['ping', 'read', 'cancel'].includes(message.type) && typeof message.requestId === 'string' && UUID.test(message.requestId)
      && (message.type !== 'read' || typeof message.sourceUrl === 'string' && message.sourceUrl.length <= 2_048);
  }

  function post(message) { window.postMessage({ channel: CHANNEL, version: 1, ...message }, ORIGIN); }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== ORIGIN || !validRequest(event.data)) return;
    const message = event.data;
    chrome.runtime.sendMessage({ channel: CHANNEL, version: 1, type: message.type, requestId: message.requestId, ...(message.type === 'read' ? { sourceUrl: message.sourceUrl } : {}) })
      .then(response => {
        if (message.type === 'ping') {
          if (response?.ok === true) post({ type: 'ready', requestId: message.requestId });
          return;
        }
        if (message.type !== 'read') return;
        if (response?.result) post({ type: 'response', requestId: message.requestId, result: response.result });
        else post({ type: 'response', requestId: message.requestId, error: response?.error || 'Não foi possível ler a cifra neste navegador.' });
      })
      .catch(() => {
        if (message.type === 'read') post({ type: 'response', requestId: message.requestId, error: 'A extensão foi desconectada. Atualize o Candeia e tente novamente.' });
      });
  });
})();
