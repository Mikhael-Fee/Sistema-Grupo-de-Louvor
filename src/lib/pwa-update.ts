/** Updates never clear Auth, drafts, caches or shared ministry data in the page. */
export const UPDATE_CHECK_INTERVAL = 5 * 60_000;
export const UPDATE_CHECK_MINIMUM = 60_000;
export const UPDATE_QUIET_PERIOD = 2_000;

export type UpdateBlocker = 'background' | 'operation' | 'editor' | 'photo' | 'credentials' | 'typing';
export type AppUpdateState = { phase: 'idle' | 'waiting' | 'reloading' | 'error'; blocker?: UpdateBlocker };

/** Editors persist text synchronously, but a selected photograph/PDF can live in RAM. */
export function updateBlocker(doc: Document, busy: boolean): UpdateBlocker | undefined {
  if (doc.visibilityState !== 'visible') return 'background';
  if (busy || doc.querySelector('[aria-busy="true"], [data-app-update-blocked="true"]')) return 'operation';
  if (doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return 'editor';
  if (doc.querySelector('.photo-picker-status')) return 'photo';
  // Signup/recovery fields are deliberately not persisted as a draft.
  if ([...doc.querySelectorAll<HTMLInputElement>('form input')].some(input =>
    ['password', 'email'].includes(input.type) && input.value.length > 0)) return 'credentials';
  if (doc.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return 'typing';
  return undefined;
}

type UpdateOptions = {
  window: Window;
  serviceWorker: ServiceWorkerContainer;
  blocker(): UpdateBlocker | undefined;
  onState(state: AppUpdateState): void;
  reload?(): void;
};

/** One coordinator per tab; the browser distributes controllerchange to every tab. */
export function createAppUpdater({ window: win, serviceWorker: workers, blocker, onState,
  reload = () => win.location.reload() }: UpdateOptions) {
  let stopped = false;
  let registration: ServiceWorkerRegistration | undefined;
  let registering: Promise<void> | undefined;
  let checking = false;
  let lastCheck = 0;
  let pending = false;
  let reloading = false;
  let state: AppUpdateState = { phase: 'idle' };
  let hadController = Boolean(workers.controller);
  let quietUntil = 0;
  let tick: number | undefined;
  let interval: number | undefined;
  const cleanups: (() => void)[] = [];

  function publish(next: AppUpdateState) {
    if (stopped || (state.phase === next.phase && state.blocker === next.blocker)) return;
    state = next;
    onState(next);
  }
  function schedule() {
    if (!pending || stopped || reloading) return;
    if (tick !== undefined) win.clearTimeout(tick);
    tick = win.setTimeout(applyWhenSafe, 300);
  }
  function applyWhenSafe() {
    tick = undefined;
    if (stopped || !pending || reloading) return;
    const blocked = blocker();
    if (blocked) {
      quietUntil = Date.now() + UPDATE_QUIET_PERIOD;
      publish({ phase: 'waiting', blocker: blocked });
      schedule();
      return;
    }
    publish({ phase: 'waiting' });
    if (Date.now() < quietUntil) { schedule(); return; }
    // An input/submit handler may have just started a save. Check again in the
    // same task immediately before replacing the document.
    if (blocker()) { schedule(); return; }
    reloading = true;
    publish({ phase: 'reloading' });
    try { reload(); }
    catch { reloading = false; publish({ phase: 'error' }); }
  }
  function queueReload() {
    if (stopped || reloading || pending) return;
    pending = true;
    quietUntil = Date.now() + UPDATE_QUIET_PERIOD;
    publish({ phase: 'waiting', blocker: blocker() });
    schedule();
  }
  function controllerChanged() {
    const controlled = Boolean(workers.controller);
    // The initial install claiming an uncontrolled page is not an update.
    if (hadController && controlled) queueReload();
    hadController = controlled;
  }
  function activateWaiting() {
    // Also handles a worker left waiting by the previous prompt-based version.
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }
  function watchRegistration(current: ServiceWorkerRegistration) {
    registration = current;
    activateWaiting();
    const updateFound = () => {
      const installing = current.installing;
      if (!installing) return;
      const changed = () => { if (installing.state === 'installed') activateWaiting(); };
      installing.addEventListener('statechange', changed);
      cleanups.push(() => installing.removeEventListener('statechange', changed));
    };
    current.addEventListener('updatefound', updateFound);
    cleanups.push(() => current.removeEventListener('updatefound', updateFound));
    updateFound();
  }
  async function start() {
    if (registering) return registering;
    workers.addEventListener('controllerchange', controllerChanged);
    cleanups.push(() => workers.removeEventListener('controllerchange', controllerChanged));
    const activity = () => { if (pending) { quietUntil = Date.now() + UPDATE_QUIET_PERIOD; schedule(); } };
    for (const event of ['input', 'change', 'submit', 'keydown', 'pointerdown']) {
      win.document.addEventListener(event, activity, true);
      cleanups.push(() => win.document.removeEventListener(event, activity, true));
    }
    const wake = () => { void check(); schedule(); };
    win.addEventListener('online', wake);
    win.addEventListener('focus', wake);
    win.document.addEventListener('visibilitychange', wake);
    cleanups.push(() => { win.removeEventListener('online', wake); win.removeEventListener('focus', wake); win.document.removeEventListener('visibilitychange', wake); });
    // If an old lazy chunk disappeared during an atomic deployment, apply the
    // available update through the same guards instead of looping on reload.
    const preloadError = (event: Event) => {
      if (!pending) return;
      event.preventDefault();
      schedule();
    };
    win.addEventListener('vite:preloadError', preloadError);
    cleanups.push(() => win.removeEventListener('vite:preloadError', preloadError));
    interval = win.setInterval(() => { void check(); }, UPDATE_CHECK_INTERVAL);
    lastCheck = Date.now(); // register() itself performs the first update check.
    registering = workers.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(current => { if (!stopped) watchRegistration(current); })
      .catch(() => { /* Offline/private-mode failure must not interrupt the app. */ });
    return registering;
  }
  async function check() {
    if (stopped || checking || !win.navigator.onLine || win.document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < UPDATE_CHECK_MINIMUM) return;
    if (!registration) {
      // Retrying a failed initial registration is useful after reconnecting.
      lastCheck = Date.now();
      checking = true;
      try { const current = await workers.register('/sw.js', { scope: '/', updateViaCache: 'none' }); if (!stopped) watchRegistration(current); }
      catch { /* Try again at the next bounded check. */ }
      finally { checking = false; }
      return;
    }
    lastCheck = Date.now();
    checking = true;
    try { await registration.update(); if (!stopped) activateWaiting(); }
    catch { /* Keep the current cached application usable while offline. */ }
    finally { checking = false; }
  }
  function retry() {
    if (!pending || reloading || stopped) return;
    quietUntil = Date.now() + UPDATE_QUIET_PERIOD;
    publish({ phase: 'waiting', blocker: blocker() });
    schedule();
  }
  function stop() {
    stopped = true;
    if (tick !== undefined) win.clearTimeout(tick);
    if (interval !== undefined) win.clearInterval(interval);
    cleanups.forEach(cleanup => cleanup());
  }
  return { start, check, retry, stop };
}
