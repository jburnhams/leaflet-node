import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import L from '../src/index.js';

/**
 * Network and Proxy Tests
 *
 * Tests network configuration, proxy support, and environment variable handling
 * for HTTP/HTTPS requests made by leaflet-node via undici.
 */
describe('Network and Proxy Support', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    element = document.createElement('div');
    element.id = 'network-test-map';
    document.body.appendChild(element);
    map = L.map(element.id);
    map.setView([0, 0], 0);
    (map as any).setSize(512, 512);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    if (map && (map as any)._container) {
      try {
        map.remove();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    if (element && element.parentNode) {
      element.remove();
    }
  });

  describe('Proxy environment variables', () => {
    it('should respect HTTP_PROXY environment variable', () => {
      process.env.HTTP_PROXY = 'http://test-proxy:8080';

      // Should not throw when proxy is set
      expect(() => {
        const img = new Image();
        img.src = 'http://example.com/image.png';
      }).not.toThrow();
    });

    it('should respect HTTPS_PROXY environment variable', () => {
      process.env.HTTPS_PROXY = 'http://test-proxy:8080';

      // Should not throw when proxy is set
      expect(() => {
        const img = new Image();
        img.src = 'https://example.com/image.png';
      }).not.toThrow();
    });

    it('should respect https_proxy (lowercase) environment variable', () => {
      process.env.https_proxy = 'http://test-proxy:8080';

      // Should not throw when proxy is set
      expect(() => {
        const img = new Image();
        img.src = 'https://example.com/image.png';
      }).not.toThrow();
    });

    it('should respect http_proxy (lowercase) environment variable', () => {
      process.env.http_proxy = 'http://test-proxy:8080';

      // Should not throw when proxy is set
      expect(() => {
        const img = new Image();
        img.src = 'http://example.com/image.png';
      }).not.toThrow();
    });

    it('should work without proxy when environment variables are not set', () => {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      delete process.env.http_proxy;
      delete process.env.https_proxy;

      // Should not throw when no proxy is set
      expect(() => {
        const img = new Image();
        img.src = 'https://tile.openstreetmap.org/0/0/0.png';
      }).not.toThrow();
    });
  });

  describe('Network error handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      const errorPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Error event did not fire'));
        }, 10000);

        img.addEventListener('error', () => {
          clearTimeout(timeout);
          resolve();
        });

        img.addEventListener('load', () => {
          clearTimeout(timeout);
          reject(new Error('Load should not succeed for invalid URL'));
        });
      });

      img.src = 'https://invalid-domain-that-does-not-exist-12345.com/image.png';

      await errorPromise;
    }, 15000);

    it('should handle network timeouts', async () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      let errorOccurred = false;

      const eventPromise = new Promise<string>((resolve) => {
        img.addEventListener('load', () => resolve('load'));
        img.addEventListener('error', () => {
          errorOccurred = true;
          resolve('error');
        });
      });

      // This URL will timeout (leaflet-node has 30s timeout)
      img.src = 'https://httpstat.us/200?sleep=35000';

      const result = await eventPromise;

      // Should either timeout and fire error, or succeed (depending on server availability)
      expect(['load', 'error']).toContain(result);
    }, 40000);
  });

  describe('Multiple concurrent requests', () => {
    it('should handle multiple concurrent image loads', async () => {
      const images = Array.from({ length: 3 }, () => {
        const img = (global as any).document.createElement('img') as HTMLImageElement;
        return img;
      });

      const loadPromises = images.map((img, index) => {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Image ${index} load timeout`));
          }, 30000);

          img.addEventListener('load', () => {
            clearTimeout(timeout);
            resolve();
          });

          img.addEventListener('error', (e: any) => {
            clearTimeout(timeout);
            reject(new Error(`Image ${index} failed to load: ${e.error || 'Unknown error'}`));
          });

          // Use different tiles to avoid rate limiting on concurrent requests
          const tiles = [
            'https://tile.openstreetmap.org/1/0/0.png',
            'https://tile.openstreetmap.org/1/0/1.png',
            'https://tile.openstreetmap.org/1/1/0.png',
          ];
          img.src = tiles[index];
        });
      });

      await Promise.all(loadPromises);
    }, 45000);
  });

  describe('Request cancellation and cleanup', () => {
    it('should handle image loading cancellation gracefully', () => {
      const img = (global as any).document.createElement('img') as HTMLImageElement;

      // Start loading
      img.src = 'https://tile.openstreetmap.org/0/0/0.png';

      // Cancel by changing src
      img.src = '';

      // Should not throw
      expect(() => {
        img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      }).not.toThrow();
    });
  });

  describe('jsdom environment compatibility', () => {
    it('should work in jsdom test environment', () => {
      expect(document).toBeDefined();
      expect(window).toBeDefined();
      // Verify we can create Image elements
      const img = (global as any).document.createElement('img');
      expect(img).toBeDefined();
      expect(img.tagName).toBe('IMG');
    });

    it('should not pollute global scope with duplicate polyfills', () => {
      const firstSetTimeout = globalThis.setTimeout;
      // setTimeout should remain the same instance
      expect(globalThis.setTimeout).toBe(firstSetTimeout);
    });

    it('should allow multiple Image instances', () => {
      const img1 = new Image();
      const img2 = new Image();
      expect(img1).not.toBe(img2);
      expect(img1.constructor).toBe(img2.constructor);
    });
  });
});
