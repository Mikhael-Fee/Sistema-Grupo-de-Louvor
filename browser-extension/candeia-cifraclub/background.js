'use strict';
importScripts('reader.js');

const CHANNEL = 'candeia-cifraclub';
const ORIGIN = 'https://louvor-grupo-fxebsy.netlify.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_JOB_TIME = 25_000; // Finish before the MV3 worker's 30s idle deadline.
const MAX_JOBS = 4;
const jobsByCandeia = new Map();
const jobsBySource = new Map();

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
    || typeof value.artist !== 'string' || !value.artist.trim() || value.artist.length > 200
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100_000
    || value.displayedKey !== undefined && (typeof value.displayedKey !== 'string' || !/^[A-G](?:#|b)?(?:maj|min|m)?$/.test(value.displayedKey))) return null;
  return { sourceUrl: job.sourceUrl, title: value.title.trim(), artist: value.artist.trim(), text: value.text,
    ...(value.displayedKey ? { displayedKey: value.displayedKey } : {}) };
}

async function finish(job, payload, focus = true) {
  if (job.finished) return;
  job.finished = true;
  clearTimeout(job.timer);
  if (Number.isInteger(job.sourceTabId)) {
    jobsBySource.delete(job.sourceTabId);
    try { await chrome.tabs.remove(job.sourceTabId); } catch { /* The user may already have closed our source tab. */ }
  }
  if (focus) {
    try { await chrome.tabs.update(job.candeiaTabId, { active: true }); } catch { /* The requesting tab may have closed. */ }
  }
  if (jobsByCandeia.get(job.candeiaTabId) === job) jobsByCandeia.delete(job.candeiaTabId);
  try { job.respond(payload); } catch { /* No receiver remains after navigation or closing the Candeia tab. */ }
}

async function open(job) {
  try {
    // Register the new tab before navigating so its content script can only
    // be authorized after it is associated with this exact request.
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    if (!Number.isInteger(tab.id)) throw new Error('Não foi possível criar a aba de consulta.');
    job.sourceTabId = tab.id;
    if (job.finished) { await chrome.tabs.remove(tab.id).catch(() => {}); return; }
    jobsBySource.set(tab.id, job);
    await chrome.tabs.update(tab.id, { url: job.sourceUrl, active: true });
  } catch {
    await finish(job, { error: 'Não foi possível abrir a cifra no navegador. Tente novamente.' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!validEnvelope(message)) return false;

  if (['ping', 'read', 'cancel'].includes(message.type)) {
    if (!fromCandeia(sender) || typeof message.requestId !== 'string' || !UUID.test(message.requestId)) {
      respond({ error: 'Esta solicitação não veio de uma aba autorizada do Candeia.' }); return false;
    }
    if (message.type === 'ping') { respond({ ok: true }); return false; }
    const current = jobsByCandeia.get(sender.tab.id);
    if (message.type === 'cancel') {
      if (current?.requestId === message.requestId) void finish(current, { error: 'Consulta cancelada.' });
      respond({ ok: true }); return false;
    }
    const sourceUrl = CandeiaCifraReader.normalizeSourceUrl(message.sourceUrl);
    if (!sourceUrl) { respond({ error: 'Escolha o link HTTPS de uma música no Cifra Club.' }); return false; }
    if (current) { respond({ error: 'Uma cifra já está sendo consultada nesta aba. Aguarde ou cancele a consulta.' }); return false; }
    if (jobsByCandeia.size >= MAX_JOBS) { respond({ error: 'Há muitas consultas abertas. Aguarde uma delas terminar.' }); return false; }
    const job = { requestId: message.requestId, candeiaTabId: sender.tab.id, sourceUrl, sourceTabId: undefined,
      finished: false, respond, timer: undefined };
    jobsByCandeia.set(sender.tab.id, job);
    job.timer = setTimeout(() => void finish(job, { error: 'A cifra não apareceu em até 25 segundos. Confira se essa versão abre normalmente no seu navegador.' }), MAX_JOB_TIME);
    void open(job);
    return true; // Keep this one response channel until the bounded read ends.
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

chrome.tabs.onRemoved.addListener(tabId => {
  const requestingJob = jobsByCandeia.get(tabId);
  if (requestingJob) { void finish(requestingJob, { error: 'A aba solicitante foi fechada.' }, false); return; }
  const sourceJob = jobsBySource.get(tabId);
  if (sourceJob) void finish(sourceJob, { error: 'A aba da cifra foi fechada antes da leitura.' });
});
