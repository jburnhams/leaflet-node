import { ReadableStream as NodeReadableStream } from 'node:stream/web';

export function ensureReadableStream(): void {
  (globalThis as Record<string, unknown>).ReadableStream = NodeReadableStream;
}

export function resetReadableStreamPolyfillForTests(): void {
  // No internal state to reset; ensureReadableStream is idempotent.
}

