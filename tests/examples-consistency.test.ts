import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import type { PNG } from 'pngjs';
import { GlobalFonts } from '@napi-rs/canvas';
import L from '../src/index.js';
import { analyzePng } from './helpers/png-analysis.js';
import { ensureTileFixture } from './helpers/tile-fixture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');

interface ExampleConfig {
  id: string;
  width: number;
  height: number;
  setup: (leaflet: typeof L, map: LeafletMap) => void;
}

let examples: ExampleConfig[] = [];

const MarkerClass = (L as any).Marker as new (...args: any[]) => LeafletMarker;

function waitForMap(map: LeafletMap): Promise<void> {
  return new Promise((resolve) => {
    map.whenReady(() => {
      // Allow a microtask for layers to attach DOM elements
      setTimeout(resolve, 0);
    });
  });
}

async function waitForTiles(map: LeafletMap, timeoutMs = 10000): Promise<void> {
  const layers: any[] = Object.values((map as any)._layers ?? {});
  const tileLayers = layers.filter((layer) => typeof layer.getTileUrl === 'function');

  await Promise.all(tileLayers.map((layer) => new Promise<void>((resolve, reject) => {
    const isLoaded = !layer._loading && (!Number.isFinite(layer._tilesToLoad) || layer._tilesToLoad === 0);
    if (isLoaded) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for tile layer to load'));
    }, timeoutMs);

    const handleLoad = () => {
      cleanup();
      resolve();
    };

    const handleError = (event: any) => {
      cleanup();
      const tileUrl = event?.tile?.src || event?.coords;
      reject(new Error(`Tile failed to load: ${tileUrl ?? 'unknown tile'}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      layer.off('load', handleLoad);
      layer.off('tileerror', handleError);
    };

    layer.on('load', handleLoad);
    layer.on('tileerror', handleError);
  })));
}

function getMarkers(map: LeafletMap): LeafletMarker[] {
  const layers: any[] = Object.values((map as any)._layers ?? {});
  return layers.filter((layer) => MarkerClass && layer instanceof MarkerClass);
}

function countDifferingPixels(pngA: PNG, pngB: PNG, tolerance = 0): number {
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    throw new Error('PNG dimensions must match to compare pixel differences');
  }

  let diffCount = 0;
  for (let i = 0; i < pngA.data.length; i += 4) {
    const dr = Math.abs(pngA.data[i] - pngB.data[i]);
    const dg = Math.abs(pngA.data[i + 1] - pngB.data[i + 1]);
    const db = Math.abs(pngA.data[i + 2] - pngB.data[i + 2]);
    const da = Math.abs(pngA.data[i + 3] - pngB.data[i + 3]);

    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      diffCount++;
    }
  }

  return diffCount;
}

interface DiffBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundingBoxOfDifferences(pngA: PNG, pngB: PNG, tolerance = 0): DiffBounds | null {
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    throw new Error('PNG dimensions must match to compare pixel differences');
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < pngA.height; y++) {
    for (let x = 0; x < pngA.width; x++) {
      const idx = (y * pngA.width + x) * 4;
      const dr = Math.abs(pngA.data[idx] - pngB.data[idx]);
      const dg = Math.abs(pngA.data[idx + 1] - pngB.data[idx + 1]);
      const db = Math.abs(pngA.data[idx + 2] - pngB.data[idx + 2]);
      const da = Math.abs(pngA.data[idx + 3] - pngB.data[idx + 3]);

      if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function boundingBoxOfDifferencesInRegion(
  pngA: PNG,
  pngB: PNG,
  tolerance: number,
  region: DiffBounds
): DiffBounds | null {
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    throw new Error('PNG dimensions must match to compare pixel differences');
  }

  const minXLimit = Math.max(0, Math.floor(region.minX));
  const minYLimit = Math.max(0, Math.floor(region.minY));
  const maxXLimit = Math.min(pngA.width - 1, Math.ceil(region.maxX));
  const maxYLimit = Math.min(pngA.height - 1, Math.ceil(region.maxY));

  if (minXLimit > maxXLimit || minYLimit > maxYLimit) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = minYLimit; y <= maxYLimit; y++) {
    for (let x = minXLimit; x <= maxXLimit; x++) {
      const idx = (y * pngA.width + x) * 4;
      const dr = Math.abs(pngA.data[idx] - pngB.data[idx]);
      const dg = Math.abs(pngA.data[idx + 1] - pngB.data[idx + 1]);
      const db = Math.abs(pngA.data[idx + 2] - pngB.data[idx + 2]);
      const da = Math.abs(pngA.data[idx + 3] - pngB.data[idx + 3]);

      if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function toPointTuple(value: any, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const [x, y] = value;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return [x, y];
    }
  }

  if (value && typeof value.x === 'number' && typeof value.y === 'number') {
    return [value.x, value.y];
  }

  return fallback;
}

async function withExample<T>(
  exampleId: string,
  handler: (context: { map: LeafletMap; example: ExampleConfig; initialSize: { x: number; y: number } }) => Promise<T> | T
): Promise<T> {
  const example = examples.find((item) => item.id === exampleId);
  if (!example) {
    throw new Error(`Example with id "${exampleId}" not found`);
  }

  const container = document.createElement('div');
  container.style.width = `${example.width}px`;
  container.style.height = `${example.height}px`;
  document.body.appendChild(container);

  const map = L.map(container as any) as LeafletMap;

  example.setup(L, map);
  const sizeBeforeResize = map.getSize();

  if (typeof (map as any).setSize === 'function' && (sizeBeforeResize.x !== example.width || sizeBeforeResize.y !== example.height)) {
    (map as any).setSize(example.width, example.height);
  }
  await waitForMap(map);

  try {
    return await handler({ map, example, initialSize: { x: sizeBeforeResize.x, y: sizeBeforeResize.y } });
  } finally {
    map.remove();
    container.remove();
  }
}

beforeAll(async () => {
  const fixtureFile = await ensureTileFixture();
  const tileFixtureUrl = pathToFileURL(fixtureFile).toString();
  process.env.LEAFLET_NODE_TILE_URL = tileFixtureUrl;

  const examplesPath = path.join(docsDir, 'examples.js');
  const examplesModule = await import(examplesPath) as { examples: ExampleConfig[] };
  examples = examplesModule.examples;
}, 30000);

describe('Documentation examples stay in sync between client and server configurations', () => {
  it('quick-start example sets the expected map view and marker placement', async () => {
    await withExample('quick-start', ({ map, initialSize, example }) => {
      expect(initialSize.x).toBe(example.width);
      expect(initialSize.y).toBe(example.height);

      const center = map.getCenter();
      expect(center.lat).toBeCloseTo(51.505538, 6);
      expect(center.lng).toBeCloseTo(-0.090005, 6);
      expect(map.getZoom()).toBe(13);

      const markers = getMarkers(map);
      expect(markers.length).toBeGreaterThan(0);
      const marker = markers[0];
      const markerLatLng = marker.getLatLng();
      expect(markerLatLng.lat).toBeCloseTo(51.505538, 6);
      expect(markerLatLng.lng).toBeCloseTo(-0.090005, 6);

      const popup = (map as any)._popup;
      expect(popup).toBeDefined();
      if (popup) {
        expect(map.hasLayer(popup)).toBe(true);
      }
    });
  });

  it('custom-icons example applies the documented icon sizing and anchors', async () => {
    await withExample('custom-icons', ({ map }) => {
      const markers = getMarkers(map);
      expect(markers.length).toBeGreaterThanOrEqual(2);

      const customMarker = markers.find((marker) => {
        const iconUrl = (marker.options.icon as any)?.options?.iconUrl;
        return typeof iconUrl === 'string' && iconUrl.includes('marker-icon-2x-green');
      });

      expect(customMarker).toBeDefined();

      const iconOptions = (customMarker!.options.icon as any).options;
      expect(iconOptions.iconSize).toEqual([25, 41]);
      expect(iconOptions.iconAnchor).toEqual([12, 41]);
      expect(iconOptions.popupAnchor).toEqual([1, -34]);
    });
  });

  it('renders the quick-start marker into the exported PNG where expected', async () => {
    await withExample('quick-start', async ({ map, example }) => {
      await waitForTiles(map);

      const initialBuffer = await (map as any).toBuffer('png');
      const { png: initialPng } = analyzePng(initialBuffer);

      expect(initialPng.width).toBe(example.width);
      expect(initialPng.height).toBe(example.height);

      const markers = getMarkers(map);
      expect(markers.length).toBeGreaterThan(0);
      const marker = markers[0];

      if (typeof map.closePopup === 'function') {
        map.closePopup();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const buffer = await (map as any).toBuffer('png');
      const { png: pngWithMarker } = analyzePng(buffer);

      expect(pngWithMarker.width).toBe(example.width);
      expect(pngWithMarker.height).toBe(example.height);

      marker.remove();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const bufferWithoutMarker = await (map as any).toBuffer('png');
      const { png: pngWithoutMarker } = analyzePng(bufferWithoutMarker);

      const differingPixels = countDifferingPixels(pngWithMarker, pngWithoutMarker, 20);
      expect(differingPixels).toBeGreaterThan(200);

      const diffBounds = boundingBoxOfDifferences(pngWithMarker, pngWithoutMarker, 20);
      expect(diffBounds).not.toBeNull();

      const markerLatLng = marker.getLatLng();
      const markerPoint = map.latLngToContainerPoint(markerLatLng);
      const iconOptions = (marker.options.icon as any)?.options ?? {};
      const iconSize = toPointTuple(iconOptions.iconSize, [25, 41]);
      const iconAnchor = toPointTuple(iconOptions.iconAnchor, [12, 41]);

      const expectedTopLeftX = markerPoint.x - iconAnchor[0];
      const expectedTopLeftY = markerPoint.y - iconAnchor[1];
      const expectedBottomRightX = expectedTopLeftX + iconSize[0];
      const expectedBottomRightY = expectedTopLeftY + iconSize[1];

      const regionPadding = 25;
      const region: DiffBounds = {
        minX: expectedTopLeftX - regionPadding,
        minY: expectedTopLeftY - regionPadding,
        maxX: expectedBottomRightX + regionPadding,
        maxY: expectedBottomRightY + regionPadding,
      };
      const markerBounds = boundingBoxOfDifferencesInRegion(
        pngWithMarker,
        pngWithoutMarker,
        20,
        region
      );
      expect(markerBounds).not.toBeNull();
      const bounds = markerBounds!;
      expect(Math.abs(bounds.minX - expectedTopLeftX)).toBeLessThanOrEqual(3);
      expect(Math.abs(bounds.minY - expectedTopLeftY)).toBeLessThanOrEqual(3);
      expect(Math.abs(bounds.maxX - expectedBottomRightX)).toBeLessThanOrEqual(3);
      expect(Math.abs(bounds.maxY - expectedBottomRightY)).toBeLessThanOrEqual(3);
    });
  });

  it('renders the custom icon marker into the exported PNG using the configured size and anchor', async () => {
    await withExample('custom-icons', async ({ map }) => {
      await waitForTiles(map);

      const markers = getMarkers(map);
      expect(markers.length).toBeGreaterThanOrEqual(2);

      const customMarker = markers.find((marker) => {
        const iconUrl = (marker.options.icon as any)?.options?.iconUrl;
        return typeof iconUrl === 'string' && iconUrl.includes('marker-icon-2x-green');
      });

      expect(customMarker).toBeDefined();
      if (!customMarker) {
        throw new Error('Custom marker not found in example');
      }

      const iconOptions = (customMarker.options.icon as any)?.options ?? {};
      const iconSize = toPointTuple(iconOptions.iconSize, [25, 41]);
      const iconAnchor = toPointTuple(iconOptions.iconAnchor, [0, 0]);
      const markerLatLng = customMarker.getLatLng();

      const bufferWithMarker = await (map as any).toBuffer('png');
      const { png: pngWithMarker } = analyzePng(bufferWithMarker);

      customMarker.remove();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const bufferWithoutMarker = await (map as any).toBuffer('png');
      const { png: pngWithoutMarker } = analyzePng(bufferWithoutMarker);

      const differingPixels = countDifferingPixels(pngWithMarker, pngWithoutMarker, 20);
      expect(differingPixels).toBeGreaterThan(200);

      const markerPoint = map.latLngToContainerPoint(markerLatLng);
      const expectedTopLeftX = markerPoint.x - iconAnchor[0];
      const expectedTopLeftY = markerPoint.y - iconAnchor[1];
      const expectedBottomRightX = expectedTopLeftX + iconSize[0];
      const expectedBottomRightY = expectedTopLeftY + iconSize[1];

      const padding = 25;
      const region: DiffBounds = {
        minX: expectedTopLeftX - padding,
        minY: expectedTopLeftY - padding,
        maxX: expectedBottomRightX + padding,
        maxY: expectedBottomRightY + padding,
      };

      const diffBounds = boundingBoxOfDifferencesInRegion(
        pngWithMarker,
        pngWithoutMarker,
        20,
        region
      );

      expect(diffBounds).not.toBeNull();

      if (diffBounds) {
        expect(diffBounds.minX).toBeGreaterThanOrEqual(expectedTopLeftX - 10);
        expect(diffBounds.minY).toBeGreaterThanOrEqual(expectedTopLeftY - 10);
        expect(diffBounds.maxX).toBeLessThanOrEqual(expectedBottomRightX + 10);
        expect(diffBounds.maxY).toBeLessThanOrEqual(expectedBottomRightY + 10);

        const measuredWidth = diffBounds.maxX - diffBounds.minX + 1;
        const measuredHeight = diffBounds.maxY - diffBounds.minY + 1;
        expect(measuredWidth).toBeGreaterThanOrEqual(iconSize[0] - 10);
        expect(measuredHeight).toBeGreaterThanOrEqual(iconSize[1] - 10);
      }
    });
  });

  it('renders the quick-start popup into the exported PNG', async () => {
    await withExample('quick-start', async ({ map }) => {
      await waitForTiles(map);

      const bufferWithPopup = await (map as any).toBuffer('png');
      const { png: pngWithPopup } = analyzePng(bufferWithPopup);

      map.closePopup();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const bufferWithoutPopup = await (map as any).toBuffer('png');
      const { png: pngWithoutPopup } = analyzePng(bufferWithoutPopup);

      const differingPixels = countDifferingPixels(pngWithPopup, pngWithoutPopup, 15);
      expect(differingPixels).toBeGreaterThan(4000);

      const diffBounds = boundingBoxOfDifferences(pngWithPopup, pngWithoutPopup, 12);
      expect(diffBounds).not.toBeNull();

      const popup: any = (map as any)._popup;
      expect(popup).toBeDefined();
      if (!popup) {
        return;
      }

      const anchorPoint = map.latLngToContainerPoint(popup.getLatLng());
      const popupAnchor = (L as any).point(popup._getAnchor ? popup._getAnchor() : [0, 0]);
      const optionOffset = popup.options?.offset ? (L as any).point(popup.options.offset) : (L as any).point(0, 0);
      const totalAnchor = anchorPoint.add(popupAnchor).add(optionOffset);

      const bounds = diffBounds!;
      const centerX = (bounds.minX + bounds.maxX) / 2;
      expect(Math.abs(centerX - totalAnchor.x)).toBeLessThanOrEqual(4);
      expect(Math.abs(bounds.maxY - totalAnchor.y)).toBeLessThanOrEqual(3);
      expect(bounds.minY).toBeLessThan(totalAnchor.y - 40);

      const tipHalfDiagonal = 17 / Math.SQRT2;
      const wrapperPadding = 1;
      const expectedBaseY = totalAnchor.y - tipHalfDiagonal - wrapperPadding;
      const arrowRegion: DiffBounds = {
        minX: Math.floor(totalAnchor.x - 20),
        minY: Math.floor(expectedBaseY) - 4,
        maxX: Math.ceil(totalAnchor.x + 20),
        maxY: Math.ceil(totalAnchor.y) + 2,
      };

      const arrowBounds = boundingBoxOfDifferencesInRegion(
        pngWithPopup,
        pngWithoutPopup,
        12,
        arrowRegion
      );

      expect(arrowBounds).not.toBeNull();
      if (arrowBounds) {
        const arrowHeight = arrowBounds.maxY - arrowBounds.minY;
        expect(arrowBounds.minY).toBeGreaterThanOrEqual(Math.floor(expectedBaseY) - 8);
        expect(arrowHeight).toBeLessThanOrEqual(tipHalfDiagonal + 8);
        expect(Math.abs(arrowBounds.maxY - totalAnchor.y)).toBeLessThanOrEqual(2);
      }
    });
  });

  it('registers a sans-serif fallback font for popup content', async () => {
    await withExample('quick-start', async ({ map }) => {
      await waitForTiles(map);

      expect(GlobalFonts.has('Helvetica Neue')).toBe(true);

      const measurementCanvas = document.createElement('canvas');
      measurementCanvas.width = 200;
      measurementCanvas.height = 60;
      const ctx = measurementCanvas.getContext('2d');

      expect(ctx).not.toBeNull();
      if (!ctx) {
        throw new Error('Failed to acquire measurement context');
      }

      ctx.font = '13px "Helvetica Neue", Arial, Helvetica, sans-serif';
      const width = ctx.measureText('A pretty popup.').width;

      expect(width).toBeGreaterThan(90);
      expect(width).toBeLessThan(95.5);
    });
  });

  it('registers multilingual glyph coverage for popup content', async () => {
    await withExample('quick-start', async ({ map }) => {
      await waitForTiles(map);

      expect(GlobalFonts.has('Helvetica Neue')).toBe(true);

      const familiesBuffer =
        typeof (GlobalFonts as any).getFamilies === 'function'
          ? (GlobalFonts as any).getFamilies()
          : null;

      expect(familiesBuffer).toBeTruthy();
      const families = familiesBuffer ? JSON.parse(Buffer.from(familiesBuffer).toString()) : [];
      const helveticaEntry = families.find((entry: any) => entry?.family === 'Helvetica Neue');

      expect(helveticaEntry).toBeDefined();
      expect(Array.isArray(helveticaEntry.styles)).toBe(true);
      expect(helveticaEntry.styles.length).toBeGreaterThanOrEqual(16);

      const measurementCanvas = document.createElement('canvas');
      measurementCanvas.width = 220;
      measurementCanvas.height = 80;
      const ctx = measurementCanvas.getContext('2d');

      expect(ctx).not.toBeNull();
      if (!ctx) {
        throw new Error('Failed to acquire measurement context');
      }

      ctx.font = '13px "Helvetica Neue", Arial, Helvetica, sans-serif';

      const cyrillicWidth = ctx.measureText('Привет, мир!').width;
      expect(cyrillicWidth).toBeGreaterThan(75);
      expect(cyrillicWidth).toBeLessThan(81);

      const devanagariWidth = ctx.measureText('नमस्ते दुनिया').width;
      expect(devanagariWidth).toBeGreaterThan(90);
      expect(devanagariWidth).toBeLessThan(98);

      const greekWidth = ctx.measureText('Γειά σου κόσμε').width;
      expect(greekWidth).toBeGreaterThan(95);
      expect(greekWidth).toBeLessThan(102);
    });
  });

});
