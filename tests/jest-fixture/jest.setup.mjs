import { jest as jestGlobals } from '@jest/globals';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
// Load the built package first, as a consumer would; it installs the undici polyfills
import '../../dist/index.mjs';

// Ensure Jest uses real timers so our timer wrappers behave consistently
jestGlobals.useRealTimers();

// jsdom in Jest does not always expose TextEncoder/TextDecoder, but undici
// expects them to exist when setting up the environment.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = NodeTextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined' && typeof NodeTextDecoder !== 'undefined') {
  globalThis.TextDecoder = NodeTextDecoder;
}
