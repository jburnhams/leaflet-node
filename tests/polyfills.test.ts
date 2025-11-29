
import { describe, it, expect } from 'vitest';
import '../src/polyfills/apply.js';
import { createCanvas } from '@napi-rs/canvas';

describe('Leaflet-Node Polyfills', () => {
  describe('Undici Compatibility', () => {
    it('should have global TextEncoder', () => {
      expect(globalThis.TextEncoder).toBeDefined();
      const encoder = new globalThis.TextEncoder();
      expect(encoder.encode('test')).toBeInstanceOf(Uint8Array);
    });

    it('should have global TextDecoder', () => {
      expect(globalThis.TextDecoder).toBeDefined();
      const decoder = new globalThis.TextDecoder();
      expect(decoder.decode(new Uint8Array([116, 101, 115, 116]))).toBe('test');
    });

    it('should have Blob.prototype.arrayBuffer', async () => {
      // Blob might be native or from JSDOM, but if it exists it should have arrayBuffer
      if (typeof globalThis.Blob !== 'undefined') {
        const blob = new Blob(['test']);
        expect(blob.arrayBuffer).toBeDefined();
        const buffer = await blob.arrayBuffer();
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        const view = new Uint8Array(buffer);
        expect(view[0]).toBe(116); // 't'
      }
    });

    it('should have setTimeout with refresh method', () => {
      // This test environment is Node, so native setTimeout has refresh.
      // But we wrapped it. We verify the wrapper exposes it.
      const timer = setTimeout(() => {}, 10);
      expect((timer as any).refresh).toBeDefined();
      expect(typeof (timer as any).refresh).toBe('function');
      clearTimeout(timer);
    });
  });

  describe('Canvas Compatibility', () => {
    // Note: The Canvas polyfills are applied in src/index.ts, not just src/polyfills/apply.ts
    // We need to import index.ts to trigger ensureCanvasPolyfills()

    it('should have addEventListener on Canvas instance after library load', async () => {
        await import('../src/index.js');

        const canvas = createCanvas(100, 100);

        // The instance should have the methods
        expect((canvas as any).addEventListener).toBeDefined();
        expect((canvas as any).removeEventListener).toBeDefined();

        // They should be no-ops
        expect(() => (canvas as any).addEventListener('click', () => {})).not.toThrow();
        expect(() => (canvas as any).removeEventListener('click', () => {})).not.toThrow();
    });
  });
});
