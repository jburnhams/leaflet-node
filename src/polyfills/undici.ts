/**
 * Polyfills for undici compatibility in jsdom/Jest environments
 *
 * undici expects certain Node.js APIs that may not be available in test environments.
 * This module provides polyfills for:
 * - setImmediate/clearImmediate
 * - setTimeout().unref()/ref()
 * - performance.markResourceTiming()
 */

let undiciPolyfillsEnsured = false;

export function ensureUndiciPolyfills(): void {
  if (undiciPolyfillsEnsured) {
    return;
  }

  undiciPolyfillsEnsured = true;

  // Polyfill setImmediate and clearImmediate
  if (typeof globalThis.setImmediate === 'undefined') {
    (globalThis as any).setImmediate = (callback: (...args: any[]) => void, ...args: any[]) => {
      return setTimeout(callback, 0, ...args);
    };
  }

  if (typeof globalThis.clearImmediate === 'undefined') {
    (globalThis as any).clearImmediate = (id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    };
  }

  // Polyfill setTimeout().unref() and ref() methods
  // These methods are used by undici to prevent timers from keeping the process alive
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = function(...args: any[]) {
    const timer = originalSetTimeout.apply(this, args as any);

    // Add unref() and ref() methods if they don't exist
    if (typeof (timer as any).unref !== 'function') {
      (timer as any).unref = function() { return this; };
    }
    if (typeof (timer as any).ref !== 'function') {
      (timer as any).ref = function() { return this; };
    }

    return timer;
  };

  // Polyfill performance.markResourceTiming()
  // undici calls this for performance metrics, we provide a no-op implementation
  if (typeof globalThis.performance !== 'undefined') {
    if (typeof (globalThis.performance as any).markResourceTiming !== 'function') {
      (globalThis.performance as any).markResourceTiming = (...args: any[]) => {
        // No-op: markResourceTiming is optional and only used for performance monitoring
        // Accept any arguments to prevent errors
      };
    }
  }
}

export function resetUndiciPolyfillsForTests(): void {
  undiciPolyfillsEnsured = false;
}
