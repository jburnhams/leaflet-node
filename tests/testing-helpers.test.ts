import { describe, it, expect, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { TileLayer } from 'leaflet';
import {
  createTestMap,
  cleanupTestMaps,
  waitForTiles,
  waitForMapReady,
  type TileLoadProgress,
} from '../src/testing.js';

describe('testing utilities', () => {
  afterEach(async () => {
    await cleanupTestMaps();
  });

  it('creates and cleans up test maps', async () => {
    const map = createTestMap({ width: 320, height: 240 });
    expect(map.getSize().x).toBe(320);
    expect(map.getSize().y).toBe(240);

    await cleanupTestMaps();
    expect(() => map.getSize()).not.toThrow();
  });

  it('waits for maps to become ready', async () => {
    const map = createTestMap();
    await waitForMapReady(map, { timeout: 2000 });
    expect(map.getCenter()).toBeDefined();
  });

  it('tracks tile loading progress', async () => {
    class FakeTileLayer extends EventEmitter {
      _loading = true;
      _tilesToLoad = 2;
      getTileUrl() { return ''; }
      on(event: string, listener: (...args: any[]) => void) {
        this.addListener(event, listener);
        return this as unknown as TileLayer;
      }
      off(event: string, listener: (...args: any[]) => void) {
        this.removeListener(event, listener);
        return this as unknown as TileLayer;
      }
    }

    const layer = new FakeTileLayer() as unknown as TileLayer & FakeTileLayer;

    const progressSpy = vi.fn();

    const waitPromise = waitForTiles(layer, {
      timeout: 2000,
      onProgress: progressSpy,
    });

    layer.emit('tileloadstart');
    layer.emit('tileload');
    layer._tilesToLoad = 1;
    layer.emit('tileload');
    layer._tilesToLoad = 0;
    layer._loading = false;
    layer.emit('load');

    await expect(waitPromise).resolves.toBeUndefined();

    const calls = progressSpy.mock.calls as Array<[TileLoadProgress]>;
    expect(calls.length).toBeGreaterThan(0);
    const lastProgress = calls.at(-1)?.[0];
    expect(lastProgress?.loaded).toBeGreaterThanOrEqual(lastProgress?.total ?? 0);
  });

  it('propagates tile errors', async () => {
    class ErrorTileLayer extends EventEmitter {
      _loading = true;
      _tilesToLoad = 1;
      getTileUrl() { return ''; }
      on(event: string, listener: (...args: any[]) => void) {
        this.addListener(event, listener);
        return this as unknown as TileLayer;
      }
      off(event: string, listener: (...args: any[]) => void) {
        this.removeListener(event, listener);
        return this as unknown as TileLayer;
      }
    }

    const layer = new ErrorTileLayer() as unknown as TileLayer & ErrorTileLayer;

    const waitPromise = waitForTiles(layer, { timeout: 1000 });
    layer.emit('tileloadstart');
    layer.emit('tileerror', { tile: { src: 'http://example.com/tile.png' } });

    await expect(waitPromise).rejects.toThrow(/Tile failed to load/);
  });

  it('rejects even if the final pending tile fails', async () => {
    class FinalErrorTileLayer extends EventEmitter {
      _loading = true;
      _tilesToLoad = 1;
      getTileUrl() { return ''; }
      on(event: string, listener: (...args: any[]) => void) {
        this.addListener(event, listener);
        return this as unknown as TileLayer;
      }
      off(event: string, listener: (...args: any[]) => void) {
        this.removeListener(event, listener);
        return this as unknown as TileLayer;
      }
    }

    const layer = new FinalErrorTileLayer() as unknown as TileLayer & FinalErrorTileLayer;

    const waitPromise = waitForTiles(layer, { timeout: 1000 });
    layer.emit('tileloadstart');
    layer._tilesToLoad = 0;
    layer._loading = false;
    layer.emit('tileerror', { tile: { src: 'http://example.com/final.png' } });
    layer.emit('load');

    await expect(waitPromise).rejects.toThrow(/Tile failed to load/);
  });
});
