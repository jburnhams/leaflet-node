import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import L from '../src/index.js';
import { analyzePng } from './helpers/png-analysis.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';

// Canvas renderer for vector layers
const canvas = L.canvas ? L.canvas() : undefined;

describe('Leaflet-node', () => {
  let element: HTMLDivElement;
  let map: L.Map;

  const lat = 52.4;
  const lng = 4.5;
  const latlng: L.LatLngExpression = [lat, lng];

  beforeAll(async () => {
    await ensureTileFixture();
  });

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'map';
    document.body.appendChild(element);

    map = L.map('map');
  });

  afterEach(() => {
    map.remove();
  });

  describe('Basic map functions', () => {
    it('has a default size of 1024x1024', () => {
      map.setView(latlng, 10);

      const size = map.getSize();
      expect(size.x).toBe(1024);
      expect(size.y).toBe(1024);
    });

    it('can change size', () => {
      map.setView(latlng, 10);
      (map as any).setSize(800, 600);

      const size = map.getSize();
      expect(size.x).toBe(800);
      expect(size.y).toBe(600);
    });

    it('can change view', async () => {
      map.setView(latlng, 5);

      const center1 = map.getCenter();
      expect(center1.lat).toBeCloseTo(lat, 5);
      expect(center1.lng).toBeCloseTo(lng, 5);
      expect(map.getZoom()).toBe(5);

      // Wait for moveend event
      await new Promise<void>((resolve) => {
        map.on('moveend', () => {
          const center2 = map.getCenter();
          expect(center2.lat).toBeCloseTo(lat, 5);
          expect(center2.lng).toBeCloseTo(lng, 5);
          expect(map.getZoom()).toBe(13);
          resolve();
        });
        map.setView(latlng, 13);
      });
    });

    it('map is pannable', () => {
      map.setView(latlng, 5);
      map.panBy([200, 0], {
        animate: false,
      });

      const center = map.getCenter();
      expect(center.lat).toBeCloseTo(lat, 1);
      expect(center.lng).toBeGreaterThan(lng);
    });

    it('has a working saveImage() method', async () => {
      map.setView([10, 10], 3);
      (map as any).setSize(200, 200);

      createLocalTileLayer().addTo(map);

      L.polyline(
        [
          [10, 10],
          [0, 0],
        ],
        {
          renderer: canvas,
        }
      ).addTo(map);

      L.marker([10, 10]).addTo(map);

      const outfilename = path.join(__dirname, 'actual', 'test-saveimage.png');

      // Ensure actual directory exists
      await fs.mkdir(path.dirname(outfilename), { recursive: true });

      // Use new async saveImage
      const filename = await (map as any).saveImage(outfilename);
      expect(filename).toBe(outfilename);

      // Check file exists
      const stats = await fs.stat(filename);
      expect(stats.isFile()).toBe(true);

      const buffer = await fs.readFile(filename);
      const analysis = analyzePng(buffer);

      expect(analysis.png.width).toBe(200);
      expect(analysis.png.height).toBe(200);
      expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
      expect(analysis.uniqueColorCount).toBeGreaterThan(50);
    });

    it('has a working toBuffer() method', async () => {
      map.setView([10, 10], 3);
      (map as any).setSize(200, 200);

      createLocalTileLayer().addTo(map);

      L.marker([10, 10]).addTo(map);

      // Test PNG export
      const pngBuffer = await (map as any).toBuffer('png');
      expect(Buffer.isBuffer(pngBuffer)).toBe(true);
      expect(pngBuffer.length).toBeGreaterThan(0);

      // Verify PNG header
      expect(pngBuffer.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');

      // Test JPEG export
      const jpegBuffer = await (map as any).toBuffer('jpeg');
      expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
      expect(jpegBuffer.length).toBeGreaterThan(0);

      // Verify JPEG header (FF D8 FF)
      expect(jpegBuffer.toString('hex', 0, 3)).toBe('ffd8ff');
    });
  });

  describe('Adding layers', () => {
    it('L.Marker()', () => {
      map.setView(latlng, 10);

      const marker = L.marker(latlng).addTo(map);

      expect(map.hasLayer(marker)).toBe(true);
    });

    it('L.TileLayer()', () => {
      map.setView(latlng, 10);

      const tilelayer = createLocalTileLayer().addTo(map);

      expect(map.hasLayer(tilelayer)).toBe(true);
    });

    it('L.Polyline()', () => {
      map.setView([52, 4], 10);

      const latlngs: L.LatLngExpression[] = [
        [52, 4],
        [54, 4],
        [54, 6],
        [52, 6],
        [52, 4],
      ];
      const polyline = L.polyline(latlngs, { renderer: canvas }).addTo(map);

      expect(map.hasLayer(polyline)).toBe(true);
    });

    it('L.GeoJSON()', () => {
      const geojson = JSON.parse(
        '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"foo":"bar"},"geometry":{"type":"Point","coordinates":[2.63671875,65.87472467098549]}},{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[-14.765625,-3.864254615721396]}},{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[4.74609375,45.706179285330855]}},{"type":"Feature","properties":{},"geometry":{"type":"LineString","coordinates":[[-13.18359375,46.437856895024225],[-8.96484375,49.83798245308484],[-5.09765625,43.83452678223684],[-30.41015625,38.272688535980976],[-32.34375,55.87531083569679],[-42.01171875,54.97761367069625],[-62.22656249999999,30.751277776257812]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-13.0078125,12.039320557540584],[-13.0078125,39.36827914916014],[16.5234375,29.99300228455108],[9.4921875,12.039320557540584],[-13.0078125,12.039320557540584]]]}}]}'
      );

      map.setView(latlng, 5);

      const layer = L.geoJson(geojson, { renderer: canvas }).addTo(map);
      map.fitBounds(layer.getBounds(), { animate: false });

      const center = map.getCenter();
      // Center should have moved away from original latlng
      const distance = Math.abs(center.lat - lat) + Math.abs(center.lng - lng);
      expect(distance).toBeGreaterThan(10);
      expect(map.getZoom()).toBe(3);
    });
  });
});
const localTileUrl = getTileFixtureUrl();
process.env.LEAFLET_NODE_TILE_URL = localTileUrl;

function createLocalTileLayer(options: L.TileLayerOptions = {}): L.TileLayer {
  return L.tileLayer(localTileUrl, {
    tileSize: 256,
    minZoom: 0,
    maxZoom: 5,
    attribution: 'Test tile fixture',
    ...options,
  });
}
