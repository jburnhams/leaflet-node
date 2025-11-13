import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import type * as TestingModule from '../src/testing.js';

type TestingModuleType = typeof TestingModule;

interface TestContext {
  module: TestingModuleType;
  dom: JSDOM;
}

type FrameRequestCallback = (time: number) => void;

async function withJsdomTestingEnvironment(run: (context: TestContext) => Promise<void>): Promise<void> {
  const previousWindow = (globalThis as any).window;
  const previousDocument = (globalThis as any).document;
  const previousImage = (globalThis as any).Image;
  const previousLeaflet = (globalThis as any).L;
  const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  vi.resetModules();

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
    resources: 'usable',
  });

  const pendingAnimationFrames = new Set<number>();
  const originalSetTimeout = dom.window.setTimeout.bind(dom.window);
  const originalClearTimeout = dom.window.clearTimeout.bind(dom.window);

  dom.window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = originalSetTimeout(() => {
      pendingAnimationFrames.delete(handle);
      callback(dom.window.performance.now());
    }, 16);
    pendingAnimationFrames.add(handle);
    return handle;
  };

  dom.window.cancelAnimationFrame = (handle: number): void => {
    if (pendingAnimationFrames.has(handle)) {
      pendingAnimationFrames.delete(handle);
      originalClearTimeout(handle);
    }
  };

  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: false,
    value: dom.window.navigator,
    writable: true,
  });

  const module = (await import('../src/testing.js')) as TestingModuleType;

  try {
    await run({ module, dom });
  } finally {
    await module.cleanupTestMaps();

    pendingAnimationFrames.forEach((handle) => {
      originalClearTimeout(handle);
    });
    pendingAnimationFrames.clear();
    dom.window.close();

    if (previousWindow !== undefined) {
      (globalThis as any).window = previousWindow;
    } else {
      delete (globalThis as any).window;
    }

    if (previousDocument !== undefined) {
      (globalThis as any).document = previousDocument;
    } else {
      delete (globalThis as any).document;
    }

    if (previousNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor);
    } else {
      delete (globalThis as any).navigator;
    }

    if (previousImage !== undefined) {
      (globalThis as any).Image = previousImage;
    } else {
      delete (globalThis as any).Image;
    }

    if (previousLeaflet !== undefined) {
      (globalThis as any).L = previousLeaflet;
    } else {
      delete (globalThis as any).L;
    }

    vi.resetModules();
  }
}

describe('leaflet-node/testing canvas support within jsdom', () => {
  it('uses the patched Leaflet instance when the DOM is pre-initialised', async () => {
    await withJsdomTestingEnvironment(async ({ module }) => {
      const { Leaflet, createTestMap, waitForMapReady } = module;

      expect(Leaflet).toBe((globalThis as any).L);
      expect(typeof Leaflet.Map.prototype.toBuffer).toBe('function');

      const map = createTestMap({ width: 160, height: 160 });
      await waitForMapReady(map, { timeout: 2000 });

      const pngBuffer = await (map as any).toBuffer('png');
      expect(Buffer.isBuffer(pngBuffer)).toBe(true);
      expect(pngBuffer.length).toBeGreaterThan(0);
    });
  });

  it('provides real canvas operations including JPEG encoding', async () => {
    await withJsdomTestingEnvironment(async ({ module }) => {
      const { Leaflet, createTestMap } = module;

      const map = createTestMap({ width: 200, height: 200 });
      Leaflet.rectangle(
        [
          [51.504, -0.09],
          [51.507, -0.08],
        ],
        { color: '#ff0000', weight: 2 }
      ).addTo(map);

      const pngBuffer = await (map as any).toBuffer('png');
      expect(Buffer.isBuffer(pngBuffer)).toBe(true);
      expect(pngBuffer.length).toBeGreaterThan(0);

      const jpegBuffer = await (map as any).toBuffer('jpeg', 0.7);
      expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
      expect(jpegBuffer.length).toBeGreaterThan(0);
      expect(jpegBuffer[0]).toBe(0xff);
      expect(jpegBuffer[1]).toBe(0xd8);
    });
  });

  it('matches consumer usage expectations with DOM-accessible canvas elements', async () => {
    await withJsdomTestingEnvironment(async ({ module, dom }) => {
      const { Leaflet, createTestMap, waitForMapReady } = module;

      const map = createTestMap({ width: 180, height: 180 });
      map.setView([51.505, -0.09], 13);

      Leaflet.polyline(
        [
          [51.5, -0.1],
          [51.51, -0.09],
        ],
        { color: '#3366ff', weight: 3 }
      ).addTo(map);

      await waitForMapReady(map, { timeout: 2000 });

      const canvas = dom.window.document.querySelector('canvas');
      expect(canvas).toBeTruthy();

      const context = canvas?.getContext('2d');
      expect(context).toBeTruthy();
      expect(typeof context?.clearRect).toBe('function');
      expect(typeof context?.save).toBe('function');
    });
  });
});
