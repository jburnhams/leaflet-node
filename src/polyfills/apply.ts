import { ensureReadableStream, resetReadableStreamPolyfillForTests } from './readable-stream.js';
import { ensureUndiciPolyfills, resetUndiciPolyfillsForTests } from './undici.js';

export function applyLeafletNodePolyfills(): void {
  ensureReadableStream();
  ensureUndiciPolyfills();
}

export function resetLeafletNodePolyfillsForTests(): void {
  resetReadableStreamPolyfillForTests();
  resetUndiciPolyfillsForTests();
}

applyLeafletNodePolyfills();
