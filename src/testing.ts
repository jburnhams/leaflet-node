import type { LatLngExpression, Map as LeafletMap, MapOptions, TileLayer } from 'leaflet';
import LeafletPatched from './index.js';
export * from './index.js';
import type { LeafletHeadlessMap } from './types.js';
import { resetReadableStreamPolyfillForTests } from './polyfills/readable-stream.js';
import { resetUndiciPolyfillsForTests } from './polyfills/undici.js';

export interface TileLoadProgress {
  /** Number of tiles that loaded successfully. */
  loaded: number;
  /** Total number of tiles that have started loading. */
  total: number;
  /** Number of tiles that failed to load. */
  failed: number;
}

export interface WaitForTilesOptions {
  /** Timeout in milliseconds before rejecting the promise. */
  timeout?: number;
  /**
   * Callback invoked whenever tile progress changes.
   *
   * Note: May not fire if tiles load very quickly (< 10ms), such as when tiles
   * are already cached or the network is extremely fast. Consider this callback
   * optional for assertion purposes.
   */
  onProgress?: (progress: TileLoadProgress) => void;
}

export interface WaitForMapReadyOptions extends WaitForTilesOptions {
  /**
   * Callback invoked whenever an individual tile layer reports progress.
   */
  onTileProgress?: (layer: TileLayer, progress: TileLoadProgress) => void;
}

export interface CreateTestMapOptions {
  width?: number;
  height?: number;
  zoom?: number;
  center?: LatLngExpression;
  mapOptions?: MapOptions;
}

const trackedMaps = new Set<LeafletMap>();

function getTileLayers(map: LeafletMap): TileLayer[] {
  const layers = Object.values((map as any)._layers ?? {}) as any[];
  return layers.filter((layer) => typeof layer.getTileUrl === 'function');
}

function createTimeout(timeout: number | undefined, onTimeout: () => void) {
  if (!timeout || timeout <= 0) {
    return { cancel: () => {} };
  }

  const handle = setTimeout(onTimeout, timeout);
  return { cancel: () => clearTimeout(handle) };
}

export function createTestMap(options: CreateTestMapOptions = {}): LeafletHeadlessMap {
  const {
    width = 800,
    height = 600,
    zoom = 13,
    center = [51.505538, -0.090005],
    mapOptions = {},
  } = options;

  const container = (global as any).document?.createElement('div');
  if (!container) {
    throw new Error('leaflet-node: DOM is not initialised. Import leaflet-node before calling createTestMap.');
  }

  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  const documentBody = (global as any).document?.body;
  if (documentBody && !container.parentNode) {
    documentBody.appendChild(container);
  }

  const map = LeafletPatched.map(container, mapOptions) as LeafletHeadlessMap;

  if (center) {
    map.setView(center, zoom);
  }

  if (typeof map.setSize === 'function') {
    map.setSize(width, height);
  }

  trackedMaps.add(map);
  return map;
}

export async function cleanupTestMaps(): Promise<void> {
  const renderers = new Set();

  trackedMaps.forEach((map) => {
    // Collect all renderers from vector layers
    map.eachLayer((layer) => {
      const layerWithRenderer = layer as any;
      if (layerWithRenderer._renderer) {
        renderers.add(layerWithRenderer._renderer);
      }
    });
  });

  // Cancel Canvas renderer animation frames BEFORE removing maps
  renderers.forEach((renderer: any) => {
    if (renderer._redrawRequest) {
      LeafletPatched.Util.cancelAnimFrame(renderer._redrawRequest);
      renderer._redrawRequest = null;
    }
  });

  // Small delay to ensure frames are fully canceled
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Now proceed with existing cleanup logic
  trackedMaps.forEach((map) => {
    try {
      // Cancel any pending animation frames on Canvas and SVG renderers
      map.eachLayer((layer) => {
        const layerWithFrame = layer as any;
        // Access internal _frame property to cancel pending animation frames
        if ((layer instanceof LeafletPatched.Canvas || layer instanceof LeafletPatched.SVG) && layerWithFrame._frame) {
          LeafletPatched.Util.cancelAnimFrame(layerWithFrame._frame);
          layerWithFrame._frame = null;
        }
      });

      map.remove();

      const container = typeof map.getContainer === 'function' ? map.getContainer() : undefined;
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    } catch (error) {
      console.warn('leaflet-node: failed to remove map during cleanup', error);
    }
  });
  trackedMaps.clear();

  // Small delay to let any remaining async operations complete
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function invokeProgress(
  callback: ((progress: TileLoadProgress) => void) | undefined,
  progress: TileLoadProgress
) {
  if (callback) {
    callback(progress);
  }
}

export function waitForTiles(
  tileLayer: TileLayer,
  options: WaitForTilesOptions = {}
): Promise<void> {
  const { timeout = 45000, onProgress } = options;

  return new Promise((resolve, reject) => {
    const initialTotal = Number.isFinite((tileLayer as any)._tilesToLoad)
      ? Math.max((tileLayer as any)._tilesToLoad || 0, 0)
      : 0;

    let loaded = 0;
    let failed = 0;
    let total = initialTotal;

    const emitProgress = () => {
      invokeProgress(onProgress, { loaded, total, failed });
    };

    const isComplete = () => {
      const pending = total - loaded - failed;
      const tilesRemaining = Number.isFinite((tileLayer as any)._tilesToLoad)
        ? Math.max((tileLayer as any)._tilesToLoad || 0, 0)
        : pending;
      const isLayerLoading =
        typeof tileLayer.isLoading === 'function'
          ? tileLayer.isLoading()
          : Boolean((tileLayer as any)._loading);
      return (!isLayerLoading && pending <= 0) || tilesRemaining <= 0;
    };

    if (isComplete()) {
      loaded = Math.max(total - failed, loaded);
      emitProgress();
      resolve();
      return;
    }

    const timer = createTimeout(timeout, () => {
      cleanup();
      reject(new Error('Timed out waiting for tile layer to load.'));
    });

    const cleanup = () => {
      timer.cancel();
      tileLayer.off('load', handleLoad);
      tileLayer.off('tileloadstart', handleTileLoadStart);
      tileLayer.off('tileload', handleTileLoad);
      tileLayer.off('tileerror', handleTileError);
    };

    const handleLoad = () => {
      loaded = Math.max(total - failed, loaded);
      emitProgress();
      cleanup();
      resolve();
    };

    const handleTileLoadStart = () => {
      total += 1;
      emitProgress();
    };

    const handleTileLoad = () => {
      loaded += 1;
      emitProgress();
      if (isComplete()) {
        handleLoad();
      }
    };

    const handleTileError = (event: any) => {
      failed += 1;
      emitProgress();
      const tileUrl = event?.tile?.src || event?.coords;
      cleanup();
      reject(new Error(`Tile failed to load: ${tileUrl ?? 'unknown tile'}`));
    };

    tileLayer.on('load', handleLoad);
    tileLayer.on('tileloadstart', handleTileLoadStart);
    tileLayer.on('tileload', handleTileLoad);
    tileLayer.on('tileerror', handleTileError);

    emitProgress();
  });
}

export async function waitForMapReady(
  map: LeafletMap,
  options: WaitForMapReadyOptions = {}
): Promise<void> {
  const { timeout = 45000, onProgress, onTileProgress } = options;

  await new Promise<void>((resolve, reject) => {
    const timer = createTimeout(timeout, () => {
      cleanup();
      reject(new Error('Timed out waiting for map readiness.'));
    });

    const cleanup = () => {
      timer.cancel();
      map.off('load', handleLoad as any);
    };

    const handleLoad = () => {
      cleanup();
      resolve();
    };

    map.whenReady(handleLoad);
  });

  const tileLayers = getTileLayers(map);
  if (tileLayers.length === 0) {
    return;
  }

  await Promise.all(
    tileLayers.map((layer) =>
      waitForTiles(layer, {
        timeout,
        onProgress: (progress) => {
          invokeProgress(onProgress, progress);
          if (onTileProgress) {
            onTileProgress(layer, progress);
          }
        },
      })
    )
  );
}

export { LeafletPatched as Leaflet };
export default LeafletPatched;

// Re-export polyfill utilities for advanced testing scenarios
export { resetReadableStreamPolyfillForTests, resetUndiciPolyfillsForTests };
