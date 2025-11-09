import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import L from '../src/index.js';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import { analyzePng } from './helpers/png-analysis.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';

/**
 * Integration Tests
 *
 * Tests the full integration of undici + leaflet-node to load real tiles
 * and render maps without errors. These tests verify that the complete
 * stack works correctly in a headless Node.js environment.
 */
describe('Integration Tests - Undici + Leaflet', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  let remoteTileAvailable = false;
  let remoteTileError: Error | null = null;
  let dispatcher: Dispatcher | null = null;
  const canvas = L.canvas ? L.canvas() : undefined;

  function resolveProxyDispatcher(): Dispatcher | null {
    const env = typeof process !== 'undefined' ? process.env ?? {} : {};
    const proxyUrl =
      env.HTTPS_PROXY ||
      env.https_proxy ||
      env.HTTP_PROXY ||
      env.http_proxy ||
      env.ALL_PROXY ||
      env.all_proxy ||
      null;

    return proxyUrl ? new ProxyAgent(proxyUrl) : null;
  }

  beforeAll(async () => {
    await ensureTileFixture();
    dispatcher = resolveProxyDispatcher();

    // Test if remote tiles are available
    try {
      const response = await undiciFetch(
        'https://tile.openstreetmap.org/0/0/0.png',
        dispatcher ? { dispatcher } : undefined
      );
      if (response.ok) {
        remoteTileAvailable = true;
      } else {
        remoteTileError = new Error(`OSM tiles unavailable: ${response.status}`);
      }
    } catch (error) {
      remoteTileError = error as Error;
    }
  }, 30000);

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'integration-test-map';
    document.body.appendChild(element);
    map = L.map(element.id);
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

  describe('Basic integration - Local tiles', () => {
    it('loads local tiles without errors', async () => {
      map.setView([0, 0], 0);
      (map as any).setSize(512, 512);

      const tileLayer = L.tileLayer(getTileFixtureUrl(), {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 5,
      }).addTo(map);

      let hasError = false;
      tileLayer.on('tileerror', () => {
        hasError = true;
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(hasError).toBe(false);
      expect(map.hasLayer(tileLayer)).toBe(true);
    });

    it('renders map with local tiles and markers without errors', async () => {
      map.setView([51.505, -0.09], 2);
      (map as any).setSize(400, 400);

      const tileLayer = L.tileLayer(getTileFixtureUrl()).addTo(map);
      const marker1 = L.marker([51.5, -0.09]).addTo(map);
      const marker2 = L.marker([48.8566, 2.3522]).addTo(map);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(map.hasLayer(tileLayer)).toBe(true);
      expect(map.hasLayer(marker1)).toBe(true);
      expect(map.hasLayer(marker2)).toBe(true);

      // Export to ensure no errors in rendering
      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('renders map with local tiles and vector layers without errors', async () => {
      map.setView([52, 4], 6);
      (map as any).setSize(600, 400);

      const tileLayer = L.tileLayer(getTileFixtureUrl()).addTo(map);

      const polyline = L.polyline(
        [
          [52, 4],
          [54, 6],
          [50, 8],
        ],
        { color: 'red', renderer: canvas }
      ).addTo(map);

      const polygon = L.polygon(
        [
          [51, 3],
          [53, 3],
          [53, 5],
          [51, 5],
        ],
        { color: 'blue', renderer: canvas }
      ).addTo(map);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(map.hasLayer(polyline)).toBe(true);
      expect(map.hasLayer(polygon)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(1000);
    });

    it('renders map with local tiles and GeoJSON without errors', async () => {
      map.setView([20, 0], 2);
      (map as any).setSize(800, 600);

      const tileLayer = L.tileLayer(getTileFixtureUrl()).addTo(map);

      const geojsonFeature = {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { name: 'Point Feature' },
            geometry: {
              type: 'Point' as const,
              coordinates: [0, 0],
            },
          },
        ],
      };

      const geoJsonLayer = L.geoJSON(geojsonFeature, {
        renderer: canvas,
      }).addTo(map);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile load timeout'));
        }, 10000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(map.hasLayer(geoJsonLayer)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with remote tiles (when available)', () => {
    it('loads OpenStreetMap tiles via undici without errors', async function (this: any) {
      if (!remoteTileAvailable) {
        console.warn(
          remoteTileError?.message ?? 'Skipping OSM test - tiles unavailable'
        );
        this.skip?.();
        return;
      }

      map.setView([51.505, -0.09], 13);
      (map as any).setSize(800, 600);

      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: 'OpenStreetMap',
          maxZoom: 19,
        }
      ).addTo(map);

      let hasError = false;
      let errorMessage = '';

      tileLayer.on('tileerror', (e: any) => {
        hasError = true;
        errorMessage = e.error?.message || 'Unknown tile error';
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile loading timeout after 30 seconds'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(hasError).toBe(false);
      if (hasError) {
        console.error('Tile loading error:', errorMessage);
      }

      // Verify map can be exported
      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);

      expect(buffer.length).toBeGreaterThan(1000);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(10);
    }, 45000);
  });

  describe('Error handling integration', () => {
    it('handles tile loading errors gracefully', async () => {
      map.setView([0, 0], 0);
      (map as any).setSize(256, 256);

      const tileLayer = L.tileLayer('file:///nonexistent/tile/{z}/{x}/{y}.png', {
        tileSize: 256,
      }).addTo(map);

      let errorOccurred = false;
      let errorEvent: any = null;

      tileLayer.on('tileerror', (e: any) => {
        errorOccurred = true;
        errorEvent = e;
      });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 3000);
        tileLayer.once('tileerror', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(errorOccurred).toBe(true);
      expect(errorEvent).toBeDefined();
      expect(errorEvent.tile).toBeDefined();

      // Map should still be functional
      expect(map.getZoom()).toBe(0);
      expect(map.getCenter().lat).toBeCloseTo(0, 1);
    });

    it('continues rendering other layers when one tile layer fails', async () => {
      map.setView([0, 0], 2);
      (map as any).setSize(400, 400);

      // Working tile layer
      const workingLayer = L.tileLayer(getTileFixtureUrl()).addTo(map);

      // Failing tile layer
      const failingLayer = L.tileLayer(
        'file:///nonexistent/{z}/{x}/{y}.png'
      ).addTo(map);

      // Add marker
      const marker = L.marker([0, 0]).addTo(map);

      let workingLayerLoaded = false;
      workingLayer.on('load', () => {
        workingLayerLoaded = true;
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for working layer'));
        }, 5000);
        workingLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(workingLayerLoaded).toBe(true);
      expect(map.hasLayer(marker)).toBe(true);

      // Should still be able to export
      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
