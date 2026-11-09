import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import L, { initializeEnvironment } from '../src/index.js';

describe('initializeEnvironment', () => {
  const maps: L.Map[] = [];

  afterEach(() => {
    // Restore the defaults so other test files are unaffected
    initializeEnvironment({ mapSize: { width: 1024, height: 1024 }, userAgent: 'webkit' });
    while (maps.length) {
      maps.pop()?.remove();
    }
  });

  function createMap(): L.Map {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const map = L.map(container).setView([0, 0], 2);
    maps.push(map);
    return map;
  }

  it('returns the same patched Leaflet namespace', () => {
    expect(initializeEnvironment()).toBe(L);
  });

  it('applies a new default mapSize to maps created afterwards', () => {
    initializeEnvironment({ mapSize: { width: 320, height: 240 } });

    const size = createMap().getSize();
    expect(size.x).toBe(320);
    expect(size.y).toBe(240);
  });

  it('still lets a map override the default size', () => {
    initializeEnvironment({ mapSize: { width: 320, height: 240 } });
    const map = createMap() as any;

    map.setSize(100, 50);
    expect(map.getSize().x).toBe(100);
    expect(map.getSize().y).toBe(50);
  });

  it('updates navigator.userAgent', () => {
    initializeEnvironment({ userAgent: 'custom-agent/1.0' });
    expect(window.navigator.userAgent).toBe('custom-agent/1.0');
  });
});

describe('global environment hygiene', () => {
  it('leaves Node timers intact so util.promisify(setTimeout) keeps working', async () => {
    const sleep = promisify(setTimeout);
    await expect(sleep(1, 'done')).resolves.toBe('done');
  });

  it('points the default marker icon path at a real file URL', () => {
    const imagePath = (L.Icon.Default as any).imagePath as string;

    expect(imagePath.startsWith('file:///')).toBe(true);
    expect(existsSync(fileURLToPath(`${imagePath}marker-icon.png`))).toBe(true);
  });
});
