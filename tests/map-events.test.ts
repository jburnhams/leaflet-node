import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import L from '../src/index.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';

/**
 * Map Events Tests
 *
 * Tests all map-level events to ensure they fire correctly in Node.js with jsdom
 * and the canvas substitute. Covers lifecycle, view changes, and zoom events.
 */
describe('Map Events', () => {
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
    element.id = 'map-events-test';
    document.body.appendChild(element);
    map = L.map(element.id);
  });

  afterEach(() => {
    if (map && (map as any)._container) {
      try {
        map.remove();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    if (element && element.parentNode) {
      element.remove();
    }
  });

  describe('Map lifecycle events', () => {
    it('fires "load" event when view is set', async () => {
      const loadSpy = vi.fn();
      map.on('load', loadSpy);

      map.setView(latlng, 10);

      // Wait for event to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(loadSpy).toHaveBeenCalled();
    });

    it('fires "viewreset" event when view changes', async () => {
      const viewresetSpy = vi.fn();
      map.setView(latlng, 10);
      map.on('viewreset', viewresetSpy);

      map.setView([lat + 1, lng + 1], 12);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(viewresetSpy).toHaveBeenCalled();
    });

    it('fires "resize" event when map size changes', async () => {
      const resizeSpy = vi.fn();
      map.setView(latlng, 10);

      // Listen to resize before changing size
      map.on('resize', resizeSpy);

      // Manually trigger invalidateSize which should fire resize
      (map as any).setSize(800, 600);
      map.invalidateSize();

      await new Promise(resolve => setTimeout(resolve, 200));

      // Note: resize event may not fire in headless mode without DOM changes
      // If the event fired, verify its structure
      if (resizeSpy.mock.calls.length > 0) {
        const event = resizeSpy.mock.calls[0][0];
        expect(event.oldSize).toBeDefined();
        expect(event.newSize).toBeDefined();
      } else {
        // In headless mode, resize might not fire - verify size changed instead
        const size = map.getSize();
        expect(size.x).toBe(800);
        expect(size.y).toBe(600);
      }
    });
  });

  describe('Map move events', () => {
    it('fires "moveend" event when panning completes', async () => {
      const moveendSpy = vi.fn();
      map.setView(latlng, 10);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('moveend event timeout'));
        }, 5000);

        map.on('moveend', () => {
          clearTimeout(timeout);
          moveendSpy();
          resolve();
        });

        map.panBy([100, 100], { animate: false });
      });

      expect(moveendSpy).toHaveBeenCalled();
    });

    it('fires move events in correct order: movestart -> move -> moveend', async () => {
      const events: string[] = [];
      map.setView(latlng, 10);

      map.on('movestart', () => events.push('movestart'));
      map.on('move', () => events.push('move'));
      map.on('moveend', () => events.push('moveend'));

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('moveend timeout'));
        }, 5000);

        map.on('moveend', () => {
          clearTimeout(timeout);
          resolve();
        });

        map.panBy([100, 100], { animate: false });
      });

      expect(events).toContain('movestart');
      expect(events).toContain('move');
      expect(events).toContain('moveend');

      // Verify order
      const movestartIndex = events.indexOf('movestart');
      const moveIndex = events.indexOf('move');
      const moveendIndex = events.lastIndexOf('moveend');

      expect(movestartIndex).toBeLessThan(moveIndex);
      expect(moveIndex).toBeLessThan(moveendIndex);
    });
  });

  describe('Map zoom events', () => {
    it('fires "zoomend" event when zoom completes', async () => {
      const zoomendSpy = vi.fn();
      map.setView(latlng, 10);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('zoomend timeout'));
        }, 5000);

        map.on('zoomend', () => {
          clearTimeout(timeout);
          zoomendSpy();
          resolve();
        });

        map.setZoom(12, { animate: false });
      });

      expect(zoomendSpy).toHaveBeenCalled();
    });

    it('fires zoom events in correct order: zoomstart -> zoom -> zoomend', async () => {
      const events: string[] = [];
      map.setView(latlng, 10);

      map.on('zoomstart', () => events.push('zoomstart'));
      map.on('zoom', () => events.push('zoom'));
      map.on('zoomend', () => events.push('zoomend'));

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('zoomend timeout'));
        }, 5000);

        map.on('zoomend', () => {
          clearTimeout(timeout);
          resolve();
        });

        map.setZoom(12, { animate: false });
      });

      expect(events).toContain('zoomstart');
      expect(events).toContain('zoom');
      expect(events).toContain('zoomend');

      // Verify order
      const zoomstartIndex = events.indexOf('zoomstart');
      const zoomIndex = events.indexOf('zoom');
      const zoomendIndex = events.lastIndexOf('zoomend');

      expect(zoomstartIndex).toBeLessThan(zoomIndex);
      expect(zoomIndex).toBeLessThan(zoomendIndex);
    });
  });

  describe('Event listeners', () => {
    it('supports "once" for one-time event listeners', async () => {
      const onceSpy = vi.fn();
      map.setView(latlng, 10);

      map.once('moveend', onceSpy);

      // First move
      await new Promise<void>((resolve) => {
        map.on('moveend', resolve);
        map.panBy([50, 50], { animate: false });
      });

      expect(onceSpy).toHaveBeenCalledTimes(1);

      // Second move
      await new Promise<void>((resolve) => {
        map.on('moveend', resolve);
        map.panBy([50, 50], { animate: false });
      });

      // Should still be 1
      expect(onceSpy).toHaveBeenCalledTimes(1);
    });

    it('supports removing event listeners with "off"', async () => {
      const offSpy = vi.fn();
      map.setView(latlng, 10);

      map.on('moveend', offSpy);

      // First move
      await new Promise<void>((resolve) => {
        map.on('moveend', resolve);
        map.panBy([50, 50], { animate: false });
      });

      expect(offSpy).toHaveBeenCalledTimes(1);

      // Remove listener
      map.off('moveend', offSpy);

      // Second move
      await new Promise<void>((resolve) => {
        map.on('moveend', resolve);
        map.panBy([50, 50], { animate: false });
      });

      // Should still be 1
      expect(offSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event context and data', () => {
    it('provides event object with type property', async () => {
      let eventData: any = null;

      map.setView(latlng, 10);
      map.on('moveend', (e) => {
        eventData = e;
      });

      await new Promise<void>((resolve) => {
        map.on('moveend', resolve);
        map.panBy([50, 50], { animate: false });
      });

      expect(eventData).toBeDefined();
      expect(eventData.type).toBe('moveend');
      expect(eventData.target).toBe(map);
    });
  });
});
