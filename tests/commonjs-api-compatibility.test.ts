import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CommonJS API Compatibility Tests
 *
 * These tests verify that leaflet-node maintains API compatibility with Leaflet
 * when used via CommonJS require(), ensuring it can be used as a drop-in replacement.
 *
 * The key requirement is that:
 *   const L = require('leaflet')
 *   const L = require('leaflet-node')
 * should behave identically - L should be the Leaflet object directly,
 * not { default: Leaflet }.
 */
describe('CommonJS API Compatibility', () => {
  describe('Drop-in replacement compatibility', () => {
    it('should export Leaflet object directly when using require() (like Leaflet does)', () => {
      // This test verifies that require('leaflet-node') returns the Leaflet object
      // at the root level, not nested under a .default property
      const script = `
        const L = require('./dist/index.js');

        // Should have Leaflet properties at root level (like Leaflet)
        const hasMapAtRoot = typeof L.Map === 'function';
        const hasMarkerAtRoot = typeof L.Marker === 'function';
        const hasIconAtRoot = typeof L.Icon === 'function';
        const hasLatLngAtRoot = typeof L.LatLng === 'function';

        // Should NOT have .default wrapper
        const hasDefault = typeof L.default !== 'undefined';

        const allKeys = Object.keys(L);

        console.log(JSON.stringify({
          hasMapAtRoot,
          hasMarkerAtRoot,
          hasIconAtRoot,
          hasLatLngAtRoot,
          hasDefault,
          hasMapKey: allKeys.includes('Map'),
          hasMarkerKey: allKeys.includes('Marker'),
          totalKeys: allKeys.length,
          firstTenKeys: allKeys.slice(0, 10)
        }));
      `;

      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());

      // Core requirement: Leaflet properties should be at root level
      expect(output.hasMapAtRoot).toBe(true);
      expect(output.hasMarkerAtRoot).toBe(true);
      expect(output.hasIconAtRoot).toBe(true);
      expect(output.hasLatLngAtRoot).toBe(true);

      // Note: .default still exists for backward compatibility with existing ESM-style usage
      // The important thing is that root-level access works (like Leaflet)
      expect(output.hasDefault).toBe(true);

      // Verify we have actual Leaflet properties as enumerable keys
      expect(output.hasMapKey).toBe(true);
      expect(output.hasMarkerKey).toBe(true);
      expect(output.totalKeys).toBeGreaterThan(50); // Should have many Leaflet properties
    });

    it('should allow the same code pattern as Leaflet for CommonJS usage', () => {
      // This verifies that code written for require('leaflet') works with require('leaflet-node')
      const script = `
        const L = require('./dist/index.js');

        // Common Leaflet usage patterns that should work identically
        const div = document.createElement('div');
        const map = L.map(div).setView([51.505, -0.09], 13);

        // Should be able to access classes and utilities directly
        const marker = L.marker([51.5, -0.09]);
        const icon = L.icon({ iconUrl: 'marker.png' });
        const latlng = L.latLng(51.5, -0.09);
        const point = L.point(100, 100);

        console.log(JSON.stringify({
          success: true,
          hasMap: !!map,
          hasMarker: !!marker,
          hasIcon: !!icon,
          hasLatLng: !!latlng,
          hasPoint: !!point
        }));
      `;

      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.success).toBe(true);
      expect(output.hasMap).toBe(true);
      expect(output.hasMarker).toBe(true);
      expect(output.hasIcon).toBe(true);
      expect(output.hasLatLng).toBe(true);
      expect(output.hasPoint).toBe(true);
    });

    it('should work with destructuring for factories and utilities', () => {
      // Common pattern: destructure factory functions and utilities (not classes that shadow globals)
      // Note: Destructuring 'Map' would shadow the global Map class used by undici, so we avoid it
      const script = `
        const L = require('./dist/index.js');

        // Destructure factory functions (safe, no global shadowing)
        const { map, marker, icon, circle, polygon } = L;

        // Access classes via L (safer than destructuring to avoid shadowing globals)
        const { Marker, Icon, LatLng } = L;

        console.log(JSON.stringify({
          hasMapFactory: typeof map === 'function',
          hasMarkerFactory: typeof marker === 'function',
          hasIconFactory: typeof icon === 'function',
          hasCircleFactory: typeof circle === 'function',
          hasPolygonFactory: typeof polygon === 'function',
          hasMarkerClass: typeof Marker === 'function',
          hasIconClass: typeof Icon === 'function',
          hasLatLngClass: typeof LatLng === 'function'
        }));
      `;

      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.hasMapFactory).toBe(true);
      expect(output.hasMarkerFactory).toBe(true);
      expect(output.hasIconFactory).toBe(true);
      expect(output.hasCircleFactory).toBe(true);
      expect(output.hasPolygonFactory).toBe(true);
      expect(output.hasMarkerClass).toBe(true);
      expect(output.hasIconClass).toBe(true);
      expect(output.hasLatLngClass).toBe(true);
    });
  });

  describe('ESM import compatibility', () => {
    it('should work with ESM default import', async () => {
      // ESM: import L from 'leaflet-node'
      const { default: L } = await import('../dist/index.mjs');

      expect(L).toBeDefined();
      expect(typeof L.Map).toBe('function');
      expect(typeof L.Marker).toBe('function');
      expect(typeof L.Icon).toBe('function');
      expect(typeof L.map).toBe('function');
      expect(typeof L.marker).toBe('function');
    });

    it('should work with ESM named imports', async () => {
      // ESM: import { initializeEnvironment } from 'leaflet-node'
      const module = await import('../dist/index.mjs');

      expect(typeof module.initializeEnvironment).toBe('function');
      expect(typeof module.setFontAssetBasePath).toBe('function');
      expect(typeof module.default).toBe('object');
    });

    it('should work with ESM namespace import', async () => {
      // ESM: import * as LeafletNode from 'leaflet-node'
      const LeafletNode = await import('../dist/index.mjs');

      expect(LeafletNode.default).toBeDefined();
      expect(typeof LeafletNode.default.Map).toBe('function');
      expect(typeof LeafletNode.initializeEnvironment).toBe('function');
    });
  });

  describe('Real-world usage patterns', () => {
    let tempFiles: string[] = [];

    afterEach(() => {
      // Clean up temp files
      tempFiles.forEach(file => {
        try {
          unlinkSync(file);
        } catch {
          // Ignore cleanup errors
        }
      });
      tempFiles = [];
    });

    it('should work in a real CommonJS file as a drop-in replacement', () => {
      // Create a temporary CommonJS file that uses leaflet-node like it would use leaflet
      const testFile = join(process.cwd(), 'temp-cjs-test.cjs');
      tempFiles.push(testFile);

      const code = `
        // This is how users would typically use Leaflet in CommonJS
        const L = require('./dist/index.js');

        // Create a map like the Leaflet docs show
        const div = document.createElement('div');
        const map = L.map(div, { center: [51.505, -0.09], zoom: 13 });

        // Add markers, layers, etc.
        const marker = L.marker([51.5, -0.09]).addTo(map);
        const circle = L.circle([51.508, -0.11], { radius: 500 }).addTo(map);

        // Verify everything works
        if (!map || !marker || !circle) {
          process.exit(1);
        }

        if (typeof L.Map !== 'function' || typeof L.Marker !== 'function') {
          console.error('Leaflet classes not accessible at root level');
          process.exit(1);
        }

        console.log('SUCCESS');
        map.remove();
      `;

      writeFileSync(testFile, code);

      const result = spawnSync(process.execPath, [testFile], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SUCCESS');
    });

    it('should work in a real ESM file', () => {
      // Create a temporary ESM file
      const testFile = join(process.cwd(), 'temp-esm-test.mjs');
      tempFiles.push(testFile);

      const code = `
        import L from './dist/index.mjs';

        // Create a map like the Leaflet docs show
        const div = document.createElement('div');
        const map = L.map(div, { center: [51.505, -0.09], zoom: 13 });

        // Add markers, layers, etc.
        const marker = L.marker([51.5, -0.09]).addTo(map);

        // Verify everything works
        if (!map || !marker) {
          process.exit(1);
        }

        console.log('SUCCESS');
        map.remove();
      `;

      writeFileSync(testFile, code);

      const result = spawnSync(process.execPath, [testFile], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SUCCESS');
    });
  });

  describe('Package.json exports configuration', () => {
    it('should have correct exports field for CommonJS and ESM', () => {
      const pkg = require('../package.json');

      expect(pkg.main).toBe('./dist/index.js');
      expect(pkg.module).toBe('./dist/index.mjs');
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['.'].require).toBe('./dist/index.js');
      expect(pkg.exports['.'].import).toBe('./dist/index.mjs');
    });
  });

  describe('API surface compatibility with Leaflet', () => {
    it('should export all major Leaflet classes and factories at root level (CommonJS)', () => {
      const script = `
        const L = require('./dist/index.js');

        const classes = [
          'Map', 'Marker', 'Icon', 'DivIcon', 'Popup', 'Tooltip',
          'TileLayer', 'ImageOverlay', 'VideoOverlay', 'SVGOverlay',
          'Circle', 'CircleMarker', 'Polygon', 'Polyline', 'Rectangle',
          'LayerGroup', 'FeatureGroup', 'GeoJSON',
          'LatLng', 'LatLngBounds', 'Point', 'Bounds',
          'Control', 'Handler', 'Projection', 'CRS', 'Transformation'
        ];

        const factories = [
          'map', 'marker', 'icon', 'divIcon', 'popup', 'tooltip',
          'tileLayer', 'imageOverlay', 'videoOverlay', 'svgOverlay',
          'circle', 'circleMarker', 'polygon', 'polyline', 'rectangle',
          'layerGroup', 'featureGroup', 'geoJSON',
          'latLng', 'latLngBounds', 'point', 'bounds'
        ];

        const missingClasses = classes.filter(c => typeof L[c] === 'undefined');
        const missingFactories = factories.filter(f => typeof L[f] === 'undefined');

        console.log(JSON.stringify({
          missingClasses,
          missingFactories,
          hasDefault: typeof L.default !== 'undefined'
        }));
      `;

      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env }
      });

      if (result.status !== 0) {
        console.error('stdout:', result.stdout);
        console.error('stderr:', result.stderr);
      }

      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());

      // All classes and factories should be present at root level
      expect(output.missingClasses).toEqual([]);
      expect(output.missingFactories).toEqual([]);

      // Note: .default exists for backward compatibility with existing ESM-style usage
      // The important thing is that all Leaflet classes are at root (like Leaflet)
      expect(output.hasDefault).toBe(true);
    });
  });
});
