(async function readRequestedCifra() {
  'use strict';
  const CHANNEL = 'candeia-cifraclub';
  if (window.top !== window || !globalThis.CandeiaCifraReader) return;
  let job;
  try {
    job = await chrome.runtime.sendMessage({ channel: CHANNEL, version: 1, type: 'reader-ready', sourceUrl: location.href });
  } catch { return; }
  // Ordinary Cifra Club tabs remain untouched. Only a tab created by a
  // pending Candeia request receives a requestId from the worker.
  if (!job?.requestId || !job?.sourceUrl) return;
  let timer;
  let completed = false;
  const stopAt = Date.now() + 25_000;

  function finish(payload) {
    if (completed) return;
    completed = true;
    clearInterval(timer);
    chrome.runtime.sendMessage({ channel: CHANNEL, version: 1, type: 'reader-result', requestId: job.requestId, sourceUrl: location.href, ...payload }).catch(() => {});
  }

  function inspect() {
    if (completed) return;
    try {
      const result = globalThis.CandeiaCifraReader.readDocument(document, job.sourceUrl, location.href);
      if (result) { finish({ result }); return; }
      if (Date.now() >= stopAt) finish({ error: 'A cifra não apareceu na página. A extensão importa somente os acordes públicos que o navegador consegue exibir.' });
    } catch (cause) {
      finish({ error: cause instanceof Error ? cause.message : 'Não foi possível reconhecer a cifra aberta.' });
    }
  }
  timer = setInterval(inspect, 500);
  inspect();
})();
