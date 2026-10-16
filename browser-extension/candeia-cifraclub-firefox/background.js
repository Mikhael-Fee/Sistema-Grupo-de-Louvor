'use strict';

const CHANNEL = 'candeia-cifraclub';
const ORIGIN = 'https://louvor-grupo-fxebsy.netlify.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Keep the channel bounded while Firefox switches the active Android tab.
const MAX_JOB_TIME = 25_000;
const MAX_JOBS = 4;
const RETURN_LIFETIME = 120_000;
const IMPORTER_VERSION = '1.1.2';
const CAPABILITIES = ['written-key-capo', 'same-tab-return'];
const jobsByCandeia = new Map();
const jobsBySource = new Map();
const completedByCandeia = new Map();

function validEnvelope(message) {
  return message && typeof message === 'object' && message.channel === CHANNEL && message.version === 1;
}

function fromCandeia(sender) {
  if (sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0) return false;
  try { return new URL(sender.url).origin === ORIGIN; } catch { return false; }
}

function matchingSource(sender, job) {
  return sender.frameId === 0 && Number.isInteger(sender.tab?.id) && sender.tab.id === job.sourceTabId
    && CandeiaCifraReader.normalizeSourceUrl(sender.url) === job.sourceUrl;
}

function validatedResult(value, job) {
  if (!value || typeof value !== 'object' || CandeiaCifraReader.normalizeSourceUrl(value.sourceUrl) !== job.sourceUrl
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200
    || typeof value.artist !== 'string' || value.artist.length > 200
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100_000
    || value.displayedKey !== undefined && (typeof value.displayedKey !== 'string' || !/^[A-G](?:#|b)?(?:maj|min|m)?$/.test(value.displayedKey))
    || value.soundingKey !== undefined && (typeof value.soundingKey !== 'string' || !/^[A-G](?:#|b)?(?:maj|min|m)?$/.test(value.soundingKey))
    || value.capo !== undefined && (!Number.isInteger(value.capo) || value.capo < 0 || value.capo > 12)
    || value.keyUnknownReason !== undefined && (typeof value.keyUnknownReason !== 'string' || value.keyUnknownReason.length > 300)) return null;
  return { sourceUrl: job.sourceUrl, title: value.title.trim(), artist: value.artist.trim(), text: value.text,
    ...(value.displayedKey ? { displayedKey: value.displayedKey } : {}),
    ...(value.soundingKey ? { soundingKey: value.soundingKey } : {}),
    ...(value.capo !== undefined ? { capo: value.capo } : {}),
    ...(value.keyUnknownReason ? { keyUnknownReason: value.keyUnknownReason } : {}) };
}

function validReturnUrl(value, requestId) {
  // A public request nonce is the only value allowed in the return address.
  // Never accept redirects, a token fragment, or an arbitrary destination.
  return typeof value === 'string' && value === `${ORIGIN}/musicas?candeia_import=${requestId}`;
}

function release(job) {
  if (job.finished) return false;
  job.finished = true;
  clearTimeout(job.timer);
  if (jobsByCandeia.get(job.candeiaTabId) === job) jobsByCandeia.delete(job.candeiaTabId);
  if (jobsBySource.get(job.sourceTabId) === job) jobsBySource.delete(job.sourceTabId);
  return true;
}

function forgetCompleted(tabId) {
  const completed = completedByCandeia.get(tabId);
  if (!completed) return;
  clearTimeout(completed.timer);
  completedByCandeia.delete(tabId);
}

async function finish(job, payload, focus = true) {
  if (!release(job)) return;
  if (job.mode === 'same-tab') {
    // The original document has gone away. Keep only its bounded public result,
    // then return the same Gecko tab; never create, focus, or remove a PWA tab.
    if (!focus) return;
    const completed = { requestId: job.requestId, payload, timer: undefined };
    completedByCandeia.set(job.candeiaTabId, completed);
    completed.timer = setTimeout(() => {
      if (completedByCandeia.get(job.candeiaTabId) === completed) completedByCandeia.delete(job.candeiaTabId);
    }, RETURN_LIFETIME);
    try { await browser.tabs.update(job.candeiaTabId, { url: job.returnUrl }); } catch { /* Back can still resume until expiry if the browser refused navigation. */ }
    return;
  }
  if (Number.isInteger(job.sourceTabId)) {
    try { await browser.tabs.remove(job.sourceTabId); } catch { /* The user may already have closed our source tab. */ }
  }
  if (focus) {
    try { await browser.tabs.update(job.candeiaTabId, { active: true }); } catch { /* The requesting tab may have closed. */ }
  }
  try { job.respond({ ...payload, importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES }); } catch { /* No receiver remains after navigation or closing the Candeia tab. */ }
}

async function open(job) {
  try {
    if (job.mode === 'same-tab') {
      // Register before navigating: the reader can announce itself immediately.
      job.sourceTabId = job.candeiaTabId;
      jobsBySource.set(job.sourceTabId, job);
      await browser.tabs.update(job.sourceTabId, { url: job.sourceUrl });
      return;
    }
    // Register the new tab before navigating so its content script can only
    // be authorized after it is associated with this exact request.
    const tab = await browser.tabs.create({ url: 'about:blank', active: true });
    if (!Number.isInteger(tab.id)) throw new Error('Não foi possível criar a aba de consulta.');
    job.sourceTabId = tab.id;
    if (job.finished) { await browser.tabs.remove(tab.id).catch(() => {}); return; }
    jobsBySource.set(tab.id, job);
    await browser.tabs.update(tab.id, { url: job.sourceUrl, active: true });
  } catch {
    await finish(job, { error: 'Não foi possível abrir a cifra no navegador. Tente novamente.' });
  }
}

browser.runtime.onMessage.addListener((message, sender, respond) => {
  if (!validEnvelope(message)) return false;

  if (['ping', 'read', 'cancel', 'resume'].includes(message.type)) {
    if (!fromCandeia(sender) || typeof message.requestId !== 'string' || !UUID.test(message.requestId)) {
      respond({ error: 'Esta solicitação não veio de uma aba autorizada do Candeia.' }); return false;
    }
    if (message.type === 'ping') { respond({ ok: true, importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES }); return false; }
    const current = jobsByCandeia.get(sender.tab.id);
    if (message.type === 'resume') {
      const completed = completedByCandeia.get(sender.tab.id);
      if (completed?.requestId === message.requestId) {
        forgetCompleted(sender.tab.id);
        respond({ ...completed.payload, importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES });
      } else if (current?.mode === 'same-tab' && current.requestId === message.requestId) {
        // Android Back may restore Candeia while the source is still loading.
        // Cancel without forcing another navigation over the restored draft.
        release(current);
        respond({ error: 'A consulta foi interrompida ao voltar ao Candeia. Tente importar novamente.', importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES });
      } else {
        respond({ error: 'Não há uma cifra pendente para esta solicitação. Faça a busca novamente.', importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES });
      }
      return false;
    }
    if (message.type === 'cancel') {
      if (current?.requestId === message.requestId) {
        if (current.mode === 'same-tab') release(current);
        else void finish(current, { error: 'Consulta cancelada.' });
      }
      respond({ ok: true }); return false;
    }
    if (message.mode !== undefined && message.mode !== 'same-tab'
      || message.mode === 'same-tab' && !validReturnUrl(message.returnUrl, message.requestId)
      || message.mode === undefined && message.returnUrl !== undefined) {
      respond({ error: 'O endereço de retorno da importação não é válido.' }); return false;
    }
    const sourceUrl = CandeiaCifraReader.normalizeSourceUrl(message.sourceUrl);
    if (!sourceUrl) { respond({ error: 'Escolha o link HTTPS de uma música no Cifra Club.' }); return false; }
    if (current) { respond({ error: 'Uma cifra já está sendo consultada nesta aba. Aguarde ou cancele a consulta.' }); return false; }
    if (completedByCandeia.has(sender.tab.id)) { respond({ error: 'Conclua a importação anterior antes de consultar outra cifra.' }); return false; }
    if (jobsBySource.has(sender.tab.id)) { respond({ error: 'Uma consulta já está em andamento nesta aba.' }); return false; }
    if (jobsByCandeia.size + completedByCandeia.size >= MAX_JOBS) { respond({ error: 'Há muitas consultas abertas. Aguarde uma delas terminar.' }); return false; }
    const job = { requestId: message.requestId, candeiaTabId: sender.tab.id, sourceUrl, sourceTabId: undefined,
      mode: message.mode, returnUrl: message.returnUrl, finished: false, respond, timer: undefined };
    jobsByCandeia.set(sender.tab.id, job);
    job.timer = setTimeout(() => void finish(job, { error: 'A cifra não apareceu em até 25 segundos. Confira se essa versão abre normalmente no seu navegador.' }), MAX_JOB_TIME);
    if (job.mode === 'same-tab') respond({ navigationStarted: true, importerVersion: IMPORTER_VERSION, capabilities: CAPABILITIES });
    void open(job);
    return job.mode !== 'same-tab'; // Same-tab navigation resumes through a new authenticated channel.
  }

  if (['reader-ready', 'reader-result'].includes(message.type)) {
    const job = jobsBySource.get(sender.tab?.id);
    if (!job || job.finished || !matchingSource(sender, job)
      || CandeiaCifraReader.normalizeSourceUrl(message.sourceUrl) !== job.sourceUrl) {
      respond({ error: 'Esta aba não pertence a uma consulta ativa.' }); return false;
    }
    if (message.type === 'reader-ready') {
      respond({ requestId: job.requestId, sourceUrl: job.sourceUrl }); return false;
    }
    if (message.requestId !== job.requestId) { respond({ error: 'A consulta já não está ativa.' }); return false; }
    const result = validatedResult(message.result, job);
    if (result) void finish(job, { result });
    else void finish(job, { error: typeof message.error === 'string' && message.error.trim()
      ? message.error.slice(0, 300) : 'A cifra recebida não tem um conteúdo reconhecido. Nenhum rascunho foi alterado.' });
    respond({ ok: true }); return false;
  }
  return false;
});

browser.tabs.onRemoved.addListener(tabId => {
  forgetCompleted(tabId);
  const requestingJob = jobsByCandeia.get(tabId);
  if (requestingJob) { void finish(requestingJob, { error: 'A aba solicitante foi fechada.' }, false); return; }
  const sourceJob = jobsBySource.get(tabId);
  if (sourceJob) void finish(sourceJob, { error: 'A aba da cifra foi fechada antes da leitura.' });
});
