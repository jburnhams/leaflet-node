import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import L from '../src/index.js';
import { analyzePng } from './helpers/png-analysis.js';
import { ensureTileFixture } from './helpers/tile-fixture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function waitForTileLayer(tileLayer: any, timeoutMs = 20000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for tile layer to load after ${timeoutMs}ms`));
    }, timeoutMs);

    tileLayer.once('load', () => {
      clearTimeout(timeout);
      resolve();
    });

    tileLayer.once('tileerror', (event: any) => {
      clearTimeout(timeout);
      const tileUrl = event?.tile?.src || event?.coords;
      reject(new Error(`Tile failed to load: ${tileUrl ?? 'unknown tile'}`));
    });
  });
}

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

describe('Tile rendering', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  let remoteTileBuffer: Buffer | null = null;
  let remoteTileError: Error | null = null;
  let dispatcher: Dispatcher | null = null;
  let remoteTileAnalysis: ReturnType<typeof analyzePng> | null = null;

  beforeAll(async () => {
    await ensureTileFixture();
    const tileUrl = 'https://tile.openstreetmap.org/0/0/0.png';
    dispatcher = resolveProxyDispatcher();

    try {
      const response = await undiciFetch(tileUrl, dispatcher ? { dispatcher } : undefined);
      if (!response.ok) {
        remoteTileError = new Error(`OpenStreetMap tile request failed: ${response.status} ${response.statusText}`);
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      remoteTileBuffer = buffer;
      remoteTileAnalysis = analyzePng(buffer);
    } catch (error) {
      const cause = (error as any)?.cause;
      if (cause?.code) {
        remoteTileError = new Error(
          `Unable to reach OpenStreetMap tile server (${tileUrl}). Network error: ${cause.code}. ` +
          'Ensure the test environment permits outbound HTTPS requests or configure HTTPS_PROXY.',
          { cause: error as any }
        );
      } else {
        remoteTileError = error as Error;
      }
    }
  }, 30000);

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'tile-map';
    document.body.appendChild(element);
    map = L.map(element.id);
  });

  afterEach(() => {
    map.remove();
    element.remove();
  });

  it('can download real OpenStreetMap tiles when network is available', async (ctx) => {
    if (!remoteTileBuffer) {
      console.warn(remoteTileError?.message ?? 'OpenStreetMap tile download skipped due to unknown error');
      ctx.skip();
      return;
    }

    expect(remoteTileBuffer.length).toBeGreaterThan(1024);
  });

  it('renders local tile layers into exported images with visible pixel data', async () => {
    map.setView([0, 0], 0);
    (map as any).setSize(256, 256);

    const tilesRoot = path.join(__dirname, 'fixtures', 'tiles');
    const tilesUrl = pathToFileURL(tilesRoot).toString();

    const tileLayer = L.tileLayer(`${tilesUrl}/{z}/{x}/{y}.png`, {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 0,
      bounds: [[-85, -180], [85, 180]],
    }).addTo(map);

    await waitForTileLayer(tileLayer);

    const pngBuffer = await (map as any).toBuffer('png');
    const analysis = analyzePng(pngBuffer);

    expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    expect(analysis.uniqueColorCount).toBeGreaterThan(20);
  }, 30000);

  it('renders remote OpenStreetMap tiles into exported images when reachable', async (ctx) => {
    if (!remoteTileBuffer) {
      console.warn(remoteTileError?.message ?? 'OpenStreetMap tile rendering skipped due to unknown error');
      ctx.skip();
      return;
    }

    map.setView([0, 0], 0);
    (map as any).setSize(256, 256);

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 0,
      bounds: [[-85, -180], [85, 180]],
    }).addTo(map);

    await waitForTileLayer(tileLayer);

    const pngBuffer = await (map as any).toBuffer('png');
    const analysis = analyzePng(pngBuffer);

    expect(analysis.nonTransparentPixels).toBeGreaterThan(5000);
    if (remoteTileAnalysis) {
      expect(analysis.uniqueColorCount).toBeGreaterThanOrEqual(remoteTileAnalysis.uniqueColorCount);
    } else {
      expect(analysis.uniqueColorCount).toBeGreaterThan(20);
    }
  }, 45000);
});
