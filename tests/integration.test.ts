import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import L from '../src/index.js';
import { ProxyAgent, type Dispatcher } from 'undici';
import { analyzePng } from './helpers/png-analysis.js';

/**
 * Integration Tests - Undici + Leaflet + Real Tiles
 *
 * Tests the full integration of undici + leaflet-node to load real OpenStreetMap tiles
 * and render maps without errors. These tests verify that the complete stack works
 * correctly in a headless Node.js environment with actual network requests.
 *
 * Network is expected to be available - tests will fail if tiles cannot be loaded.
 */
describe('Integration Tests - Undici + Leaflet', () => {
  let element: HTMLDivElement;
  let map: L.Map;
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

  beforeEach(() => {
    dispatcher = resolveProxyDispatcher();
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

  describe('Real tile loading via undici', () => {
    it('loads OpenStreetMap tiles without errors', async () => {
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

      if (hasError) {
        throw new Error(`Tile loading failed: ${errorMessage}`);
      }

      expect(hasError).toBe(false);

      // Verify map can be exported
      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);

      expect(buffer.length).toBeGreaterThan(1000);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(10);
    }, 45000);

    it('loads OSM tiles with markers and exports successfully', async () => {
      map.setView([51.505, -0.09], 13);
      (map as any).setSize(600, 400);

      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: 'OpenStreetMap',
        }
      ).addTo(map);

      // Add markers
      const marker1 = L.marker([51.505, -0.09])
        .bindPopup('London')
        .addTo(map);
      const marker2 = L.marker([51.51, -0.1])
        .bindPopup('Near London')
        .addTo(map);

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

      if (hasError) {
        throw new Error(`Tile loading failed: ${errorMessage}`);
      }

      expect(hasError).toBe(false);
      expect(map.hasLayer(marker1)).toBe(true);
      expect(map.hasLayer(marker2)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    }, 45000);

    it('loads OSM tiles with vector overlays and exports successfully', async () => {
      map.setView([48.8566, 2.3522], 12); // Paris
      (map as any).setSize(800, 600);

      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ).addTo(map);

      // Add vector overlays
      const circle = L.circle([48.8566, 2.3522], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.3,
        radius: 1000,
        renderer: canvas,
      }).addTo(map);

      const polygon = L.polygon(
        [
          [48.86, 2.34],
          [48.86, 2.36],
          [48.85, 2.36],
        ],
        {
          color: 'blue',
          renderer: canvas,
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

      if (hasError) {
        throw new Error(`Tile loading failed: ${errorMessage}`);
      }

      expect(hasError).toBe(false);
      expect(map.hasLayer(circle)).toBe(true);
      expect(map.hasLayer(polygon)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(20);
    }, 45000);

    it('loads OSM tiles with GeoJSON and exports successfully', async () => {
      map.setView([40.7128, -74.006], 11); // New York
      (map as any).setSize(800, 600);

      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ).addTo(map);

      // Add GeoJSON layer
      const geojsonFeature = {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { name: 'Manhattan' },
            geometry: {
              type: 'Point' as const,
              coordinates: [-74.006, 40.7128],
            },
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Route' },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [-74.006, 40.7128],
                [-73.935, 40.7306],
                [-73.99, 40.75],
              ],
            },
          },
        ],
      };

      const geoJsonLayer = L.geoJSON(geojsonFeature, {
        renderer: canvas,
      }).addTo(map);

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

      if (hasError) {
        throw new Error(`Tile loading failed: ${errorMessage}`);
      }

      expect(hasError).toBe(false);
      expect(map.hasLayer(geoJsonLayer)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    }, 45000);

    it('loads multiple zoom levels without errors', async () => {
      const zoomLevels = [10, 13, 15];
      const center: L.LatLngExpression = [52.3676, 4.9041]; // Amsterdam

      for (const zoom of zoomLevels) {
        map.setView(center, zoom);
        (map as any).setSize(600, 400);

        const tileLayer = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        ).addTo(map);

        let hasError = false;
        let errorMessage = '';

        tileLayer.on('tileerror', (e: any) => {
          hasError = true;
          errorMessage = e.error?.message || 'Unknown tile error';
        });

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Tile loading timeout at zoom ${zoom}`));
          }, 30000);

          tileLayer.once('load', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        if (hasError) {
          throw new Error(`Tile loading failed at zoom ${zoom}: ${errorMessage}`);
        }

        expect(hasError).toBe(false);

        const buffer = await (map as any).toBuffer('png');
        expect(buffer.length).toBeGreaterThan(1000);

        // Clean up for next iteration
        map.removeLayer(tileLayer);
      }
    }, 120000);

    it('handles all tile events correctly during load', async () => {
      map.setView([35.6762, 139.6503], 12); // Tokyo
      (map as any).setSize(800, 600);

      const events: string[] = [];

      // Create tile layer but don't add it yet
      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      );

      // Set up event listeners BEFORE adding to map
      tileLayer.on('loading', () => events.push('loading'));
      tileLayer.on('tileloadstart', () => events.push('tileloadstart'));
      tileLayer.on('tileload', () => events.push('tileload'));
      tileLayer.on('load', () => events.push('load'));

      let hasError = false;
      tileLayer.on('tileerror', (e: any) => {
        hasError = true;
        events.push('tileerror');
      });

      // Now add to map
      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile loading timeout after 30 seconds'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      if (hasError) {
        throw new Error('Tile loading encountered errors');
      }

      // Verify event sequence
      expect(events).toContain('loading');
      expect(events).toContain('tileloadstart');
      expect(events).toContain('tileload');
      expect(events).toContain('load');
      expect(events).not.toContain('tileerror');

      // Verify order
      const loadingIndex = events.indexOf('loading');
      const tileloadstartIndex = events.indexOf('tileloadstart');
      const tileloadIndex = events.indexOf('tileload');
      const loadIndex = events.indexOf('load');

      expect(loadingIndex).toBeLessThan(tileloadstartIndex);
      expect(tileloadstartIndex).toBeLessThan(tileloadIndex);
      expect(tileloadIndex).toBeLessThan(loadIndex);
    }, 45000);
  });

  describe('Multiple tile layers', () => {
    it('loads multiple tile layers simultaneously without errors', async () => {
      map.setView([34.0522, -118.2437], 10); // Los Angeles
      (map as any).setSize(800, 600);

      const tileLayer1 = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          opacity: 0.7,
        }
      ).addTo(map);

      const tileLayer2 = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          opacity: 0.3,
        }
      ).addTo(map);

      let layer1Error = false;
      let layer2Error = false;

      tileLayer1.on('tileerror', () => {
        layer1Error = true;
      });
      tileLayer2.on('tileerror', () => {
        layer2Error = true;
      });

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Layer 1 timeout'));
          }, 30000);
          tileLayer1.once('load', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Layer 2 timeout'));
          }, 30000);
          tileLayer2.once('load', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
      ]);

      if (layer1Error || layer2Error) {
        throw new Error('One or more tile layers failed to load');
      }

      expect(layer1Error).toBe(false);
      expect(layer2Error).toBe(false);
      expect(map.hasLayer(tileLayer1)).toBe(true);
      expect(map.hasLayer(tileLayer2)).toBe(true);

      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(1000);
    }, 60000);
  });
});
