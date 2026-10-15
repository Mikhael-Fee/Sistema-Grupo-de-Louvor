import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppUpdater, updateBlocker, UPDATE_CHECK_INTERVAL, UPDATE_CHECK_MINIMUM, type AppUpdateState, type UpdateBlocker } from './pwa-update';

function fixture(controlled = true) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible',
    querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []), activeElement: null });
  const win = Object.assign(new EventTarget(), { document: doc, navigator: { onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval });
  const registration = Object.assign(new EventTarget(), { waiting: null as null | { postMessage: ReturnType<typeof vi.fn> },
    installing: null, update: vi.fn(async () => {}) });
  const workers = Object.assign(new EventTarget(), { controller: controlled ? {} : null,
    register: vi.fn(async () => registration) });
  const reload = vi.fn();
  const states: AppUpdateState[] = [];
  let blocked: UpdateBlocker | undefined;
  const updater = createAppUpdater({ window: win as unknown as Window,
    serviceWorker: workers as unknown as ServiceWorkerContainer,
    blocker: () => blocked, reload, onState: state => states.push(state) });
  return { doc, win, workers, registration, reload, states, updater,
    block(value?: UpdateBlocker) { blocked = value; },
    changeController() { workers.controller = {}; workers.dispatchEvent(new Event('controllerchange')); } };
}

describe('mandatory application updates', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('registers the root worker with cache bypass, independently of the current route', async () => {
    const f = fixture();
    await f.updater.start();
    expect(f.workers.register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    f.updater.stop();
  });

  it('does not reload on focus, visibility or same-version checks', async () => {
    const f = fixture();
    await f.updater.start();
    f.win.dispatchEvent(new Event('focus'));
    f.doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MINIMUM);
    await f.updater.check();
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    expect(f.reload).not.toHaveBeenCalled();
    f.updater.stop();
  });

  it('checks at most once per minute and every five minutes without a focus storm', async () => {
    const f = fixture();
    await f.updater.start();
    for (let index = 0; index < 30; index++) await f.updater.check();
    expect(f.registration.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    await Promise.all(Array.from({ length: 30 }, () => f.updater.check()));
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    f.updater.stop();
  });

  it('claims an initially uncontrolled page without reloading it', async () => {
    const f = fixture(false);
    await f.updater.start();
    f.changeController();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.reload).not.toHaveBeenCalled();
    expect(f.states).toHaveLength(0);
    f.updater.stop();
  });

  it('reloads exactly once for an actual new controller and duplicate notifications', async () => {
    const f = fixture();
    await f.updater.start();
    f.changeController(); f.changeController();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(f.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.reload).toHaveBeenCalledTimes(1);
    f.changeController();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.reload).toHaveBeenCalledTimes(1);
    expect(f.states.at(-1)).toEqual({ phase: 'reloading' });
    f.updater.stop();
  });

  it.each<UpdateBlocker>(['editor', 'operation', 'photo', 'credentials', 'typing', 'background'])(
    'keeps %s untouched and applies the required update after it becomes safe', async blocker => {
      const f = fixture();
      await f.updater.start();
      f.block(blocker); f.changeController();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.reload).not.toHaveBeenCalled();
      expect(f.states.at(-1)).toEqual({ phase: 'waiting', blocker });
      f.block();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(f.reload).toHaveBeenCalledTimes(1);
      f.updater.stop();
    });

  it('waits for typing to settle even when the text already has a tab draft', async () => {
    const f = fixture();
    await f.updater.start();
    f.changeController();
    await vi.advanceTimersByTimeAsync(1_800);
    f.doc.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.reload).toHaveBeenCalledTimes(1);
    f.updater.stop();
  });

  it('automatically activates a worker left waiting by the legacy prompt', async () => {
    const f = fixture();
    const postMessage = vi.fn();
    f.registration.waiting = { postMessage };
    await f.updater.start();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
    expect(f.reload).not.toHaveBeenCalled();
    f.updater.stop();
  });

  it('keeps the current page when offline and retries a failed registration after reconnecting', async () => {
    const f = fixture();
    f.workers.register.mockRejectedValueOnce(new Error('offline'));
    await f.updater.start();
    f.win.navigator.onLine = false;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
    expect(f.workers.register).toHaveBeenCalledTimes(1);
    f.win.navigator.onLine = true;
    f.win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.workers.register).toHaveBeenCalledTimes(2);
    expect(f.reload).not.toHaveBeenCalled();
    f.updater.stop();
  });

  it('removes listeners and timers on unmount rather than reloading an old React instance', async () => {
    const f = fixture();
    await f.updater.start();
    f.changeController();
    f.updater.stop();
    f.changeController(); f.win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2);
    expect(f.reload).not.toHaveBeenCalled();
    expect(f.registration.update).not.toHaveBeenCalled();
  });
});

describe('non-durable work guards', () => {
  function documentFixture(selector: string | null = null, inputs: { type: string; value: string }[] = [], active = false) {
    return { visibilityState: 'visible', querySelector: (value: string) => value === selector ? {} : null,
      querySelectorAll: () => inputs, activeElement: active ? { matches: () => true } : null } as unknown as Document;
  }
  it('protects a native dialog, including PDF previews and selected photographs', () => {
    expect(updateBlocker(documentFixture('dialog[open], [role="dialog"][aria-modal="true"]'), false)).toBe('editor');
  });
  it('protects both an active operation and a prepared, unsaved profile photograph', () => {
    expect(updateBlocker(documentFixture(), true)).toBe('operation');
    expect(updateBlocker(documentFixture('[aria-busy="true"], [data-app-update-blocked="true"]'), false)).toBe('operation');
    expect(updateBlocker(documentFixture('.photo-picker-status'), false)).toBe('photo');
  });
  it('protects credentials without persisting a password', () => {
    expect(updateBlocker(documentFixture(null, [{ type: 'password', value: 'fixture-secret' }]), false)).toBe('credentials');
    expect(updateBlocker(documentFixture(null, [{ type: 'email', value: 'fixture@example.invalid' }]), false)).toBe('credentials');
  });
  it('allows a resting, safe page but does not interrupt a focused editable field', () => {
    expect(updateBlocker(documentFixture(), false)).toBeUndefined();
    expect(updateBlocker(documentFixture(null, [], true), false)).toBe('typing');
  });
});
