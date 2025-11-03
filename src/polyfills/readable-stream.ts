import { ReadableStream as NodeReadableStream } from 'node:stream/web';

let readableStreamEnsured = false;

export function ensureReadableStream(): void {
  if (readableStreamEnsured) {
    return;
  }

  readableStreamEnsured = true;

  if (typeof globalThis.ReadableStream === 'undefined') {
    (globalThis as Record<string, unknown>).ReadableStream = NodeReadableStream;
  }
}

export function resetReadableStreamPolyfillForTests(): void {
  readableStreamEnsured = false;
}

