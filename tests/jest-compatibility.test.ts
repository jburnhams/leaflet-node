import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Jest Compatibility Tests
 *
 * These tests verify that leaflet-node works correctly in Jest/jsdom environments
 * by ensuring all required polyfills are in place for undici compatibility.
 */
describe('Jest Compatibility', () => {
  describe('Polyfill initialization order', () => {
    let originalReadableStream: typeof globalThis.ReadableStream;

    beforeEach(() => {
      originalReadableStream = globalThis.ReadableStream;
      vi.resetModules();
    });

    afterEach(async () => {
      if (typeof originalReadableStream === 'undefined') {
        delete (globalThis as any).ReadableStream;
      } else {
        (globalThis as any).ReadableStream = originalReadableStream;
      }

      const [{ resetReadableStreamPolyfillForTests }, { resetUndiciPolyfillsForTests }] = await Promise.all([
        import('../src/polyfills/readable-stream.js'),
        import('../src/polyfills/undici.js')
      ]);

      resetReadableStreamPolyfillForTests();
      resetUndiciPolyfillsForTests();
      vi.resetModules();
    });

    it('should throw when importing undici without ReadableStream', () => {
      const script = "delete globalThis.ReadableStream; import('undici');";
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8'
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/ReadableStream is not defined/);
    });

    it('should ensure polyfills are applied before undici in image module', async () => {
      delete (globalThis as any).ReadableStream;
      const imageModule = await import('../src/image.js');

      expect(imageModule).toBeDefined();
      expect(typeof imageModule.loadImageSource).toBe('function');
    });
  });

  describe('Leaflet environment', () => {
    let L: typeof import('../src/index.js').default;

    beforeAll(async () => {
      vi.resetModules();
      const { applyLeafletNodePolyfills } = await import('../src/polyfills/apply.js');
      applyLeafletNodePolyfills();
      ({ default: L } = await import('../src/index.js'));
    });

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

      it('should allow clearTimeout with wrapped timer objects', () => {
        const timer = setTimeout(() => {}, 1000);
        expect(() => clearTimeout(timer)).not.toThrow();
      });

      it('should allow clearTimeout with unwrapped timer IDs', () => {
        const timer = setTimeout(() => {}, 1000);
        const numericId = timer.valueOf();
        expect(() => clearTimeout(numericId as any)).not.toThrow();
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
        expect(L).toBeDefined();
      });

      it('should trigger load event for valid images via addEventListener', async () => {
        const img = document.createElement('img') as HTMLImageElement;

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

      it('should trigger load event via onload property', async () => {
        const img = document.createElement('img') as HTMLImageElement;

        const loadPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Image onload did not fire within 5 seconds'));
          }, 5000);

          img.onload = () => {
            clearTimeout(timeout);
            expect(img.width).toBe(1);
            expect(img.height).toBe(1);
            resolve();
          };

          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Image onerror should not have fired'));
          };
        });

        img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        await loadPromise;
      }, 10000);

      it('should fire both addEventListener and onload for same event', async () => {
        const img = document.createElement('img') as HTMLImageElement;

        let addEventListenerCalled = false;
        let onloadCalled = false;

        const bothCalledPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout - addEventListener: ${addEventListenerCalled}, onload: ${onloadCalled}`));
          }, 5000);

          const checkBoth = () => {
            if (addEventListenerCalled && onloadCalled) {
              clearTimeout(timeout);
              resolve();
            }
          };

          img.addEventListener('load', () => {
            addEventListenerCalled = true;
            checkBoth();
          });

          img.onload = () => {
            onloadCalled = true;
            checkBoth();
          };
        });

        img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        await bothCalledPromise;

        expect(addEventListenerCalled).toBe(true);
        expect(onloadCalled).toBe(true);
      }, 10000);

      it('should fire load event when src is set on createElement img', async () => {
        const img = document.createElement('img') as HTMLImageElement;
        document.body.appendChild(img);

        const loaded = new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 5000);

          img.addEventListener('load', () => {
            clearTimeout(timeout);
            resolve(true);
          });
        });

        img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        await expect(loaded).resolves.toBe(true);
        expect(img.width).toBe(1);
        expect(img.height).toBe(1);

        // Cleanup
        document.body.removeChild(img);
      }, 10000);

      it('should trigger error event for invalid images', async () => {
        const img = document.createElement('img') as HTMLImageElement;

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
        const img = document.createElement('img') as HTMLImageElement;

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
        const img = document.createElement('img') as HTMLImageElement;

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

  describe('Jest regression integration suite', () => {
    it('should execute the Jest/jsdom fixture without errors', () => {
      const jestBin = path.resolve(process.cwd(), 'node_modules', 'jest', 'bin', 'jest.js');
      const configPath = path.resolve(__dirname, 'jest-fixture/jest.config.cjs');

      const result = spawnSync(process.execPath, [jestBin, '--config', configPath, '--runInBand'], {
        cwd: path.resolve(__dirname, 'jest-fixture'),
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
            .filter(Boolean)
            .join(' '),
        },
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        console.error(result.stdout);
        console.error(result.stderr);
      }

      const combinedOutput = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(combinedOutput).toMatch(/Tests:\s+5 passed/);
    });
  });
});
