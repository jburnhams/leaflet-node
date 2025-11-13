import { describe, expect, it, afterEach, jest } from '@jest/globals';

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('leaflet-node jest/jsdom integration', () => {
  it('wraps numeric timer handles with ref/unref helpers', () => {
    const timer: any = setTimeout(() => {}, 10);

    expect(typeof timer).toBe('object');
    expect(typeof timer.ref).toBe('function');
    expect(typeof timer.unref).toBe('function');
    expect(timer.ref()).toBe(timer);
    expect(timer.unref()).toBe(timer);
    expect(Number(timer)).toEqual(expect.any(Number));

    clearTimeout(timer);
  });

  it('allows wrapped timer handles to be cleared correctly', async () => {
    const spy = jest.fn();
    const timer: any = setTimeout(spy, 5);

    clearTimeout(timer);

    await new Promise(resolve => setTimeout(resolve, 15));

    expect(spy).not.toHaveBeenCalled();
  });

  it('provides a performance.markResourceTiming stub', () => {
    const markResourceTiming = (performance as any).markResourceTiming;

    expect(typeof markResourceTiming).toBe('function');

    expect(() => {
      markResourceTiming('resource');
    }).not.toThrow();
  });

  it('can import undici without missing polyfills', async () => {
    const undici = await import('undici');

    expect(undici).toBeDefined();
    expect(typeof undici.fetch).toBe('function');
  });

  it('can import and use leaflet-node in jsdom environment', async () => {
    // This test verifies that leaflet-node works when Jest already provides jsdom
    const leafletNode = await import('../../src/index.js');
    const L = leafletNode.default;

    expect(L).toBeDefined();
    expect(L.Icon).toBeDefined();
    expect(L.Icon.Default).toBeDefined();
    expect(L.Map).toBeDefined();

    // Verify that the icon imagePath is set correctly for headless environment
    expect(L.Icon.Default.imagePath).toBeDefined();
    expect(L.Icon.Default.imagePath).toMatch(/^file:\/\//);
    expect(L.Icon.Default.imagePath).toContain('leaflet');
    expect(L.Icon.Default.imagePath).toContain('images');

    // Verify that markers can be created successfully
    const div = document.createElement('div');
    const map = L.map(div).setView([51.505, -0.09], 13);
    const marker = L.marker([51.505, -0.09]);

    expect(marker).toBeDefined();
    expect(marker.options.icon).toBeDefined();

    map.remove();
  });

  it('can use leaflet-node/testing with canvas and toBuffer with polylines', async () => {
    // This test verifies that canvas patching works correctly when using
    // leaflet-node/testing in a Jest/jsdom environment with vector layers
    const testingModule = await import('../../src/testing.js');
    const { createTestMap, Leaflet: L } = testingModule;

    const map = createTestMap({ width: 400, height: 300 });
    map.setView([51.505, -0.09], 13);

    // Add polyline - this creates a Canvas renderer
    L.polyline([
      [51.5, -0.1],
      [51.51, -0.09],
    ], { color: '#ff0000' }).addTo(map);

    // Verify canvas elements are properly patched
    const canvases = Array.from(document.querySelectorAll('canvas'));
    expect(canvases.length).toBeGreaterThan(0);

    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      expect(ctx).toBeTruthy();
      expect(typeof ctx?.clearRect).toBe('function');
      expect(typeof ctx?.save).toBe('function');
    }

    // Test toBuffer with PNG format
    const pngBuffer = await (map as any).toBuffer('png');
    expect(Buffer.isBuffer(pngBuffer)).toBe(true);
    expect(pngBuffer.length).toBeGreaterThan(0);

    // Test toBuffer with JPEG format
    const jpegBuffer = await (map as any).toBuffer('jpeg', 0.8);
    expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
    expect(jpegBuffer.length).toBeGreaterThan(0);
    // Verify JPEG magic bytes
    expect(jpegBuffer[0]).toBe(0xff);
    expect(jpegBuffer[1]).toBe(0xd8);
  });

  it('can use saveImage with JPEG format in jsdom', async () => {
    // This test verifies the complete saveImage workflow with vector layers
    const testingModule = await import('../../src/testing.js');
    const { createTestMap, Leaflet: L } = testingModule;

    const map = createTestMap({ width: 400, height: 300 });
    map.setView([51.505, -0.09], 13);

    // Add multiple vector layers to stress test canvas handling
    L.polyline([
      [51.5, -0.1],
      [51.51, -0.09],
    ], { color: '#ff0000', weight: 3 }).addTo(map);

    L.circle([51.505, -0.09], {
      color: '#00ff00',
      fillColor: '#00ff00',
      fillOpacity: 0.5,
      radius: 100
    }).addTo(map);

    L.rectangle([
      [51.504, -0.091],
      [51.506, -0.089],
    ], { color: '#0000ff', weight: 2 }).addTo(map);

    // Test saveImage with JPEG format
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaflet-jest-test-'));
    const jpegPath = path.join(tmpDir, 'test-map.jpg');

    const savedPath = await (map as any).saveImage(jpegPath, { format: 'jpeg', quality: 0.8 });
    expect(savedPath).toBe(jpegPath);

    // Verify file exists and has content
    const stats = await fs.stat(jpegPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);

    // Verify JPEG format by reading magic bytes
    const buffer = await fs.readFile(jpegPath);
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
