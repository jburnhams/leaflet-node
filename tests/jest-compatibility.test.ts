import { describe, it, expect, beforeAll } from 'vitest';
import L from '../src/index.js';

/**
 * Jest Compatibility Tests
 *
 * These tests verify that leaflet-node works correctly in Jest/jsdom environments
 * by ensuring all required polyfills are in place for undici compatibility.
 */
describe('Jest Compatibility', () => {
  describe('Global polyfills', () => {
    it('should have setImmediate polyfilled', () => {
      expect(typeof globalThis.setImmediate).toBe('function');
    });

    it('should have clearImmediate polyfilled', () => {
      expect(typeof globalThis.clearImmediate).toBe('function');
    });

    it('should have ReadableStream polyfilled', () => {
      expect(typeof globalThis.ReadableStream).toBe('function');
    });

    it('should support setImmediate/clearImmediate functionality', async () => {
      let called = false;
      const id = globalThis.setImmediate(() => {
        called = true;
      });
      expect(id).toBeDefined();

      // Wait for setImmediate to execute
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(called).toBe(true);
    });

    it('should support clearImmediate functionality', async () => {
      let called = false;
      const id = globalThis.setImmediate(() => {
        called = true;
      });
      globalThis.clearImmediate(id);

      // Wait to ensure it doesn't execute
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(called).toBe(false);
    });
  });

  describe('Timer polyfills', () => {
    it('should have setTimeout().unref() method', () => {
      const timer = setTimeout(() => {}, 1000);
      expect(typeof (timer as any).unref).toBe('function');
      clearTimeout(timer);
    });

    it('should have setTimeout().ref() method', () => {
      const timer = setTimeout(() => {}, 1000);
      expect(typeof (timer as any).ref).toBe('function');
      clearTimeout(timer);
    });

    it('should support timer.unref() chaining', () => {
      const timer = setTimeout(() => {}, 1000);
      const result = (timer as any).unref();
      expect(result).toBe(timer);
      clearTimeout(timer);
    });

    it('should support timer.ref() chaining', () => {
      const timer = setTimeout(() => {}, 1000);
      const result = (timer as any).ref();
      expect(result).toBe(timer);
      clearTimeout(timer);
    });
  });

  describe('Performance polyfills', () => {
    it('should have performance.markResourceTiming() method', () => {
      expect(typeof performance).toBe('object');
      // The method should exist either natively or via our polyfill
      expect(typeof (performance as any).markResourceTiming).toBe('function');
    });

    it('should have performance object available', () => {
      // Ensure performance is defined for undici to use
      expect(globalThis.performance).toBeDefined();
      expect(typeof globalThis.performance).toBe('object');
    });
  });

  describe('HTMLImageElement event handling', () => {
    beforeAll(() => {
      // Ensure L is initialized
      expect(L).toBeDefined();
    });

    it('should trigger load event for valid images', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      const loadPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Image load event did not fire within 5 seconds'));
        }, 5000);

        img.addEventListener('load', () => {
          clearTimeout(timeout);
          resolve();
        });

        img.addEventListener('error', (e) => {
          clearTimeout(timeout);
          reject(new Error(`Image error event fired: ${(e as any).error}`));
        });
      });

      // Set a valid image source (data URI)
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      await loadPromise;
    }, 10000);

    it('should trigger error event for invalid images', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      const errorPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Image error event did not fire within 5 seconds'));
        }, 5000);

        img.addEventListener('load', () => {
          clearTimeout(timeout);
          reject(new Error('Image load event should not have fired for invalid image'));
        });

        img.addEventListener('error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Set an invalid image source
      img.src = '/path/to/nonexistent/image.png';

      await errorPromise;
    }, 10000);

    it('should timeout and trigger error event for hanging requests', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      // This test verifies that the timeout mechanism works
      // We use a valid domain that should respond, but if undici hangs,
      // our timeout should kick in
      const eventPromise = new Promise<string>((resolve) => {
        img.addEventListener('load', () => {
          resolve('load');
        });

        img.addEventListener('error', () => {
          resolve('error');
        });
      });

      // Set an image source
      img.src = 'https://tile.openstreetmap.org/0/0/0.png';

      const result = await eventPromise;

      // Either load or error should fire (not hang indefinitely)
      expect(['load', 'error']).toContain(result);
    }, 35000); // Slightly longer than our 30s timeout
  });

  describe('Image loading with undici', () => {
    it('should successfully load images from HTTP URLs', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      const loadPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Image load timeout'));
        }, 10000);

        img.addEventListener('load', () => {
          clearTimeout(timeout);
          expect(img.width).toBeGreaterThan(0);
          expect(img.height).toBeGreaterThan(0);
          resolve();
        });

        img.addEventListener('error', (e) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load image: ${(e as any).error}`));
        });
      });

      img.src = 'https://tile.openstreetmap.org/0/0/0.png';

      await loadPromise;
    }, 15000);
  });
});
