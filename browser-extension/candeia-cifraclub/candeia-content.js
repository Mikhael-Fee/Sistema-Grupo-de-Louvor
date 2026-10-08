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

  function importerMetadata(response) {
    return { ...(typeof response?.importerVersion === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(response.importerVersion)
      ? { importerVersion: response.importerVersion } : {}),
      ...(Array.isArray(response?.capabilities) && response.capabilities.includes('written-key-capo')
        ? { capabilities: ['written-key-capo'] } : {}) };
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== ORIGIN || !validRequest(event.data)) return;
    const message = event.data;
    chrome.runtime.sendMessage({ channel: CHANNEL, version: 1, type: message.type, requestId: message.requestId, ...(message.type === 'read' ? { sourceUrl: message.sourceUrl } : {}) })
      .then(response => {
        if (message.type === 'ping') {
          if (response?.ok === true) post({ type: 'ready', requestId: message.requestId, ...importerMetadata(response) });
          return;
        }
        if (message.type !== 'read') return;
        if (response?.result) post({ type: 'response', requestId: message.requestId, result: response.result, ...importerMetadata(response) });
        else post({ type: 'response', requestId: message.requestId, error: response?.error || 'Não foi possível ler a cifra neste navegador.', ...importerMetadata(response) });
      })
      .catch(() => {
        if (message.type === 'read') post({ type: 'response', requestId: message.requestId, error: 'A extensão foi desconectada. Atualize o Candeia e tente novamente.' });
      });
  });
})();
