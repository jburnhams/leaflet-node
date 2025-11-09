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
});
