/**
 * Polyfills for undici compatibility in jsdom/Jest environments
 *
 * undici expects a handful of Node.js globals that test environments such as
 * `jest-environment-jsdom` do not expose. Every polyfill here is applied only
 * when the global is missing, so plain Node.js processes are left untouched.
 *
 * - TextEncoder/TextDecoder
 * - MessageChannel/MessagePort (undici >= 7 type-checks against MessagePort)
 * - Blob.prototype.arrayBuffer
 * - setImmediate/clearImmediate
 * - ref()/unref()/refresh() on timer handles when setTimeout returns numbers
 * - performance.markResourceTiming()
 */

import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { MessageChannel as NodeMessageChannel, MessagePort as NodeMessagePort } from 'node:worker_threads';

let undiciPolyfillsEnsured = false;

function defineGlobalIfMissing(name: string, value: unknown): void {
  const globalRecord = globalThis as Record<string, unknown>;
  if (typeof globalRecord[name] === 'undefined' && typeof value !== 'undefined') {
    globalRecord[name] = value;
  }
}

/**
 * Browser-like environments (jsdom) return numeric timer ids, while undici calls
 * `.unref()` / `.refresh()` on the handle. Only in that case do we wrap timers.
 */
function timersReturnNumbers(): boolean {
  const probe = globalThis.setTimeout(() => {}, 0);
  globalThis.clearTimeout(probe);
  return typeof probe === 'number';
}

function wrapNumericTimers(): void {
  const wrappedTimerIds = new WeakMap<object, number>();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const wrappedSetTimeout = function (this: unknown, ...args: unknown[]) {
    const timer = (originalSetTimeout as (...a: unknown[]) => unknown).apply(this, args);

    if (typeof timer !== 'number') {
      return timer;
    }

    const wrappedTimer = {
      ref() {
        return this;
      },
      unref() {
        return this;
      },
      refresh() {
        return this;
      },
      hasRef() {
        return true;
      },
      valueOf() {
        return timer;
      },
      [Symbol.toPrimitive]() {
        return timer;
      },
    };

    wrappedTimerIds.set(wrappedTimer, timer);
    return wrappedTimer;
  };

  const wrappedClearTimeout = function (this: unknown, id: unknown) {
    const numericId =
      id !== null && typeof id === 'object' ? wrappedTimerIds.get(id) : undefined;
    return originalClearTimeout.call(this, (numericId ?? id) as Parameters<typeof clearTimeout>[0]);
  };

  (globalThis as any).setTimeout = wrappedSetTimeout;
  (globalThis as any).clearTimeout = wrappedClearTimeout;
}

function blobToArrayBuffer(this: Blob): Promise<ArrayBuffer> {
  const blob = this as Blob & { stream?: () => AsyncIterable<Uint8Array> };

  if (typeof blob.stream === 'function') {
    return (async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of blob.stream!()) {
        chunks.push(chunk);
      }
      const merged = Buffer.concat(chunks);
      return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
    })();
  }

  // Fallback for jsdom Blobs, which support FileReader but not stream()
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read Blob'));
    reader.readAsArrayBuffer(blob);
  });
}

export function ensureUndiciPolyfills(): void {
  if (undiciPolyfillsEnsured) {
    return;
  }

  undiciPolyfillsEnsured = true;

  defineGlobalIfMissing('TextEncoder', NodeTextEncoder);
  defineGlobalIfMissing('TextDecoder', NodeTextDecoder);
  defineGlobalIfMissing('MessageChannel', NodeMessageChannel);
  defineGlobalIfMissing('MessagePort', NodeMessagePort);

  if (typeof globalThis.Blob !== 'undefined' && !globalThis.Blob.prototype.arrayBuffer) {
    globalThis.Blob.prototype.arrayBuffer = blobToArrayBuffer;
  }

  if (typeof globalThis.setImmediate === 'undefined') {
    (globalThis as any).setImmediate = (callback: (...args: any[]) => void, ...args: any[]) =>
      setTimeout(callback, 0, ...args);
  }

  if (typeof globalThis.clearImmediate === 'undefined') {
    (globalThis as any).clearImmediate = (id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    };
  }

  if (timersReturnNumbers()) {
    wrapNumericTimers();
  }

  // undici reports resource timings; jsdom's performance object lacks the hook
  if (
    typeof globalThis.performance !== 'undefined' &&
    typeof (globalThis.performance as any).markResourceTiming !== 'function'
  ) {
    (globalThis.performance as any).markResourceTiming = () => {};
  }
}

export function resetUndiciPolyfillsForTests(): void {
  undiciPolyfillsEnsured = false;
}
