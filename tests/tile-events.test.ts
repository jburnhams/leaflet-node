import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import L from '../src/index.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';

/**
 * Tile Events Tests
 *
 * Tests tile layer specific events to ensure they fire correctly in Node.js with jsdom
 * when using undici for HTTP tile loading. Covers tile loading lifecycle events.
 */
describe('Tile Events', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  const lat = 0;
  const lng = 0;
  const latlng: L.LatLngExpression = [lat, lng];

  beforeAll(async () => {
    await ensureTileFixture();
  });

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'tile-events-test';
    document.body.appendChild(element);
    map = L.map(element.id);
    map.setView(latlng, 0);
    (map as any).setSize(256, 256);
  });

  afterEach(() => {
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

  describe('Tile layer loading events', () => {
    it('fires "loading" event when tiles start loading', async () => {
      const loadingSpy = vi.fn();

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 5,
      });

      tileLayer.on('loading', loadingSpy);
      map.addLayer(tileLayer);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(loadingSpy).toHaveBeenCalled();
    });

    it('fires "load" event when all tiles have loaded', async () => {
      const loadSpy = vi.fn();

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 5,
      });

      tileLayer.on('load', loadSpy);
      map.addLayer(tileLayer);

      // Wait for tiles to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(loadSpy).toHaveBeenCalled();
    });

    it('fires "tileloadstart" event for each tile that starts loading', async () => {
      const tileloadstartSpy = vi.fn();

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 0,
      });

      tileLayer.on('tileloadstart', tileloadstartSpy);
      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(tileloadstartSpy).toHaveBeenCalled();
    });

    it('fires "tileload" event for each successfully loaded tile', async () => {
      const tileloadSpy = vi.fn();

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 0,
      });

      tileLayer.on('tileload', tileloadSpy);
      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(tileloadSpy).toHaveBeenCalled();
      const event = tileloadSpy.mock.calls[0][0];
      expect(event.type).toBe('tileload');
      expect(event.tile).toBeDefined();
      expect(event.coords).toBeDefined();
    });
  });

  describe('Tile error events', () => {
    it('fires "tileerror" event when tile fails to load', async () => {
      const tileerrorSpy = vi.fn();

      const tileLayer = L.tileLayer('file:///nonexistent/tile/{z}/{x}/{y}.png', {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 0,
      });

      tileLayer.on('tileerror', tileerrorSpy);
      map.addLayer(tileLayer);

      // Wait for error or timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 3000);
        tileLayer.once('tileerror', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(tileerrorSpy).toHaveBeenCalled();
      const event = tileerrorSpy.mock.calls[0][0];
      expect(event.type).toBe('tileerror');
      expect(event.tile).toBeDefined();
    });
  });

  describe('Tile unload events', () => {
    it('fires "tileunload" when layer is removed from map', async () => {
      const tileunloadSpy = vi.fn();

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 0,
      });

      map.addLayer(tileLayer);

      // Wait for tiles to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      tileLayer.on('tileunload', tileunloadSpy);

      map.removeLayer(tileLayer);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(tileunloadSpy).toHaveBeenCalled();
    });
  });
});
