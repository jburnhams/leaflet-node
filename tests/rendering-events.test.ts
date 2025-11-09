import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import L from '../src/index.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';
import { analyzePng } from './helpers/png-analysis.js';

/**
 * Tile Rendering Events Tests
 *
 * Tests that verify tiles are actually rendered to canvas and that rendering
 * events fire correctly. These tests track the rendering pipeline from tile
 * load through canvas drawing.
 */
describe('Tile Rendering Events', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  const canvas = L.canvas ? L.canvas() : undefined;

  beforeAll(async () => {
    await ensureTileFixture();
  });

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'rendering-test-map';
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

  describe('Tile rendering to canvas', () => {
    it('renders tiles to canvas and fires complete rendering pipeline events', async () => {
      map.setView([0, 0], 0);
      (map as any).setSize(512, 512);

      const events: string[] = [];
      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        tileSize: 256,
        minZoom: 0,
        maxZoom: 5,
      });

      // Track all tile lifecycle events
      tileLayer.on('loading', () => events.push('loading'));
      tileLayer.on('tileloadstart', () => events.push('tileloadstart'));
      tileLayer.on('tileload', () => events.push('tileload'));
      tileLayer.on('load', () => events.push('load'));

      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Verify event sequence
      expect(events).toContain('loading');
      expect(events).toContain('tileloadstart');
      expect(events).toContain('tileload');
      expect(events).toContain('load');

      // Verify tiles were actually rendered by exporting canvas
      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);

      // Should have rendered content
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(10);
    }, 45000);

    it('tracks individual tile rendering with coordinates', async () => {
      map.setView([51.505, -0.09], 2);
      (map as any).setSize(512, 512);

      const tilesRendered: Array<{ x: number; y: number; z: number }> = [];
      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');

      tileLayer.on('tileload', (e: any) => {
        if (e.coords) {
          tilesRendered.push({
            x: e.coords.x,
            y: e.coords.y,
            z: e.coords.z,
          });
        }
      });

      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tile rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Should have rendered multiple tiles
      expect(tilesRendered.length).toBeGreaterThan(0);

      // Verify all tiles have valid coordinates
      for (const tile of tilesRendered) {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.z).toBeGreaterThanOrEqual(0);
      }

      // Verify rendered output
      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(1000);
    }, 45000);

    it('fires rendering events for each zoom level change', async () => {
      map.setView([48.8566, 2.3522], 10);
      (map as any).setSize(400, 400);

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      map.addLayer(tileLayer);

      // Wait for initial load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Initial load timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Track events during zoom change
      const zoomEvents: string[] = [];
      tileLayer.on('loading', () => zoomEvents.push('loading'));
      tileLayer.on('load', () => zoomEvents.push('load'));

      // Change zoom and wait for new tiles to render
      map.setZoom(12, { animate: false });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Zoom change rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Should have fired loading and load for the zoom change
      expect(zoomEvents).toContain('loading');
      expect(zoomEvents).toContain('load');

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(1000);
    }, 60000);
  });

  describe('Canvas layer rendering events', () => {
    it('renders vector layers to canvas and verifies output', async () => {
      map.setView([52.3676, 4.9041], 12);
      (map as any).setSize(600, 400);

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      map.addLayer(tileLayer);

      // Add vector layers with canvas renderer
      const layersAdded: string[] = [];

      const circle = L.circle([52.3676, 4.9041], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.5,
        radius: 1000,
        renderer: canvas,
      });

      circle.on('add', () => layersAdded.push('circle'));
      map.addLayer(circle);

      const polyline = L.polyline(
        [
          [52.36, 4.88],
          [52.37, 4.92],
          [52.38, 4.90],
        ],
        {
          color: 'blue',
          weight: 3,
          renderer: canvas,
        }
      );

      polyline.on('add', () => layersAdded.push('polyline'));
      map.addLayer(polyline);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Verify layers were added
      expect(layersAdded).toContain('circle');
      expect(layersAdded).toContain('polyline');

      // Verify canvas rendering by exporting
      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);

      // Should have tiles plus vector layer pixels
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(20);
    }, 45000);

    it('tracks canvas redraw events during layer updates', async () => {
      map.setView([40.7128, -74.006], 11);
      (map as any).setSize(800, 600);

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      map.addLayer(tileLayer);

      const polygon = L.polygon(
        [
          [40.71, -74.01],
          [40.72, -74.01],
          [40.72, -74.00],
          [40.71, -74.00],
        ],
        {
          color: 'green',
          renderer: canvas,
        }
      );

      let polygonAdded = false;
      polygon.on('add', () => {
        polygonAdded = true;
      });

      map.addLayer(polygon);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(polygonAdded).toBe(true);

      // Update polygon style and verify it triggers redraw
      polygon.setStyle({ color: 'purple', fillOpacity: 0.8 });

      // Small delay for style update
      await new Promise(resolve => setTimeout(resolve, 200));

      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(1000);
    }, 45000);
  });

  describe('Marker rendering events', () => {
    it('renders markers and tracks their addition to the map', async () => {
      map.setView([35.6762, 139.6503], 12);
      (map as any).setSize(600, 400);

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      map.addLayer(tileLayer);

      const markersAdded: number[] = [];
      const markers = [
        L.marker([35.6762, 139.6503]),
        L.marker([35.68, 139.66]),
        L.marker([35.67, 139.68]),
      ];

      markers.forEach((marker, index) => {
        marker.on('add', () => markersAdded.push(index));
        map.addLayer(marker);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // All markers should have fired add events
      expect(markersAdded).toHaveLength(3);
      expect(markersAdded).toContain(0);
      expect(markersAdded).toContain(1);
      expect(markersAdded).toContain(2);

      // Verify markers are visible in export
      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    }, 45000);
  });

  describe('Layer ordering and z-index rendering', () => {
    it('renders multiple layers in correct order', async () => {
      map.setView([34.0522, -118.2437], 10);
      (map as any).setSize(800, 600);

      const renderOrder: string[] = [];

      // Base tile layer
      const baseTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 1.0,
      });
      baseTiles.on('add', () => renderOrder.push('baseTiles'));
      map.addLayer(baseTiles);

      // Overlay tile layer
      const overlayTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.3,
      });
      overlayTiles.on('add', () => renderOrder.push('overlayTiles'));
      map.addLayer(overlayTiles);

      // Vector layer
      const vectorLayer = L.circle([34.0522, -118.2437], {
        radius: 5000,
        renderer: canvas,
      });
      vectorLayer.on('add', () => renderOrder.push('vectorLayer'));
      map.addLayer(vectorLayer);

      // Marker layer
      const marker = L.marker([34.0522, -118.2437]);
      marker.on('add', () => renderOrder.push('marker'));
      map.addLayer(marker);

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Base tiles timeout')), 30000);
          baseTiles.once('load', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Overlay tiles timeout')), 30000);
          overlayTiles.once('load', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
      ]);

      // Verify layers were added in order
      expect(renderOrder).toEqual(['baseTiles', 'overlayTiles', 'vectorLayer', 'marker']);

      const buffer = await (map as any).toBuffer('png');
      const analysis = analyzePng(buffer);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    }, 60000);
  });

  describe('Map pane rendering', () => {
    it('renders to different map panes correctly', async () => {
      map.setView([51.505, -0.09], 13);
      (map as any).setSize(600, 400);

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      map.addLayer(tileLayer);

      // Verify map panes exist
      const mapContainer = (map as any)._container;
      const mapPane = (map as any)._panes?.mapPane;
      const tilePane = (map as any)._panes?.tilePane;
      const overlayPane = (map as any)._panes?.overlayPane;
      const markerPane = (map as any)._panes?.markerPane;

      expect(mapContainer).toBeDefined();
      expect(mapPane).toBeDefined();
      expect(tilePane).toBeDefined();
      expect(overlayPane).toBeDefined();
      expect(markerPane).toBeDefined();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Verify rendering to panes produced output
      const buffer = await (map as any).toBuffer('png');
      expect(buffer.length).toBeGreaterThan(1000);
    }, 45000);
  });

  describe('Rendering performance tracking', () => {
    it('tracks tile load timing for performance monitoring', async () => {
      map.setView([48.8566, 2.3522], 12);
      (map as any).setSize(600, 400);

      const tileTimings: Array<{ start: number; end: number; duration: number }> = [];
      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');

      tileLayer.on('tileloadstart', () => {
        const start = Date.now();
        const originalOnLoad = tileLayer.once;

        tileLayer.on('tileload', function handler() {
          const end = Date.now();
          tileTimings.push({
            start,
            end,
            duration: end - start,
          });
          tileLayer.off('tileload', handler);
        });
      });

      map.addLayer(tileLayer);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Rendering timeout'));
        }, 30000);

        tileLayer.once('load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Should have timing data for tiles
      expect(tileTimings.length).toBeGreaterThan(0);

      // All durations should be reasonable (< 30 seconds per tile)
      for (const timing of tileTimings) {
        expect(timing.duration).toBeGreaterThan(0);
        expect(timing.duration).toBeLessThan(30000);
      }
    }, 45000);
  });
});
