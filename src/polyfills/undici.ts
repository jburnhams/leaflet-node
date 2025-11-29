/**
 * Polyfills for undici compatibility in jsdom/Jest environments
 *
 * undici expects certain Node.js APIs that may not be available in test environments.
 * This module provides polyfills for:
 * - setImmediate/clearImmediate
 * - setTimeout().unref()/ref()/refresh()
 * - performance.markResourceTiming()
 * - TextEncoder/TextDecoder (required by undici)
 * - Blob.prototype.arrayBuffer (required by undici)
 */

let undiciPolyfillsEnsured = false;

export function ensureUndiciPolyfills(): void {
  if (undiciPolyfillsEnsured) {
    return;
  }

  undiciPolyfillsEnsured = true;

  // Polyfill TextEncoder/TextDecoder
  if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
    try {
      // eslint-disable-next-line no-eval
      const req = typeof require === 'function' ? require : (typeof globalThis.require === 'function' ? globalThis.require : undefined);

      if (req) {
        const util = req('node:util');

        if (typeof globalThis.TextEncoder === 'undefined' && util.TextEncoder) {
          globalThis.TextEncoder = util.TextEncoder;
        }

        if (typeof globalThis.TextDecoder === 'undefined' && util.TextDecoder) {
          globalThis.TextDecoder = util.TextDecoder as any;
        }
      }
    } catch (e) {
      // Ignore if util cannot be loaded
    }
  }

  // Polyfill Blob.prototype.arrayBuffer
  if (typeof globalThis.Blob !== 'undefined' && !globalThis.Blob.prototype.arrayBuffer) {
    globalThis.Blob.prototype.arrayBuffer = function() {
      // If the Blob has a stream method (Node.js Blobs), use it
      if ((this as any).stream) {
        return (async () => {
          const chunks = [];
          for await (const chunk of (this as any).stream()) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks).buffer;
        })();
      }

      // Fallback for JSDOM or other environments using FileReader
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

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

  // Polyfill setTimeout().unref(), ref(), and refresh() methods
  // These methods are used by undici to prevent timers from keeping the process alive
  const wrappedTimerIds = new Map<any, number>();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  (globalThis as any).setTimeout = function(...args: any[]) {
    const timer = originalSetTimeout.apply(this, args as any);

    if (typeof timer === 'number') {
      const wrappedTimer: any = {
        ref() {
          return this;
        },
        unref() {
          return this;
        },
        refresh() {
           return this;
        },
        valueOf() {
          return timer;
        },
      };

      if (typeof Symbol !== 'undefined' && Symbol.toPrimitive) {
        Object.defineProperty(wrappedTimer, Symbol.toPrimitive, {
          value: () => timer,
          configurable: true,
        });
      }

      wrappedTimerIds.set(wrappedTimer, timer);
      return wrappedTimer;
    }

    // Add unref() and ref() methods if they don't exist
    if (typeof (timer as any).unref !== 'function') {
      (timer as any).unref = function() { return this; };
    }
    if (typeof (timer as any).ref !== 'function') {
      (timer as any).ref = function() { return this; };
    }
    if (typeof (timer as any).refresh !== 'function') {
        (timer as any).refresh = function() { return this; };
    }

    return timer;
  };

  (globalThis as any).clearTimeout = function(id: any) {
    if (wrappedTimerIds.has(id)) {
      const numericId = wrappedTimerIds.get(id)!;
      wrappedTimerIds.delete(id);
      return originalClearTimeout.call(this, numericId as any);
    }

    return originalClearTimeout.call(this, id as any);
  };

  // Polyfill performance.markResourceTiming()
  // undici calls this for performance metrics, we provide a no-op implementation
  if (typeof globalThis.performance !== 'undefined') {
    if (typeof (globalThis.performance as any).markResourceTiming !== 'function') {
      (globalThis.performance as any).markResourceTiming = (..._args: any[]) => {
        // No-op: markResourceTiming is optional and only used for performance monitoring
        // Accept any arguments to prevent errors
      };
    }
  }
}

export function resetUndiciPolyfillsForTests(): void {
  undiciPolyfillsEnsured = false;
}
