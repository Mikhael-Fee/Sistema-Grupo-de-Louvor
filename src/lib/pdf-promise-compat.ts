type PromiseCapability<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

/** PDF.js' legacy build still requires this ES2024 API in both JS realms. */
export function ensurePdfPromiseCompatibility(): void {
  const constructor = Promise as PromiseConstructor & { withResolvers?: <T>() => PromiseCapability<T> };
  if (typeof constructor.withResolvers === 'function') return;
  Object.defineProperty(constructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(this: PromiseConstructor): PromiseCapability<T> {
      let resolve!: PromiseCapability<T>['resolve'];
      let reject!: PromiseCapability<T>['reject'];
      const promise = new this<T>((complete, fail) => { resolve = complete; reject = fail; });
      return { promise, resolve, reject };
    },
  });
}
