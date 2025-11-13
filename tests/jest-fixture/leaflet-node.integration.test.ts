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
});
