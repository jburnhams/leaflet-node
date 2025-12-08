
import L from '../src/index';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('JSDOM Interaction Support', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('L.DomEvent.getMousePosition', () => {
    it('should calculate position using getBoundingClientRect if available', () => {
      const container = document.createElement('div');

      // Mock getBoundingClientRect
      container.getBoundingClientRect = vi.fn(() => ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
        width: 100,
        height: 100,
        x: 10,
        y: 20,
        toJSON: () => {}
      }));

      // JSDOM defaults clientLeft/Top to 0, which is fine

      // Create a mock event relative to the viewport (page)
      // clientX = left + 30 = 40
      // clientY = top + 40 = 60
      const event = {
        clientX: 40,
        clientY: 60,
        type: 'click'
      } as unknown as MouseEvent;

      const pos = L.DomEvent.getMousePosition(event, container);

      expect(pos.x).toBe(30);
      expect(pos.y).toBe(40);
    });

    it('should respect container clientLeft/clientTop (borders)', () => {
      const container = document.createElement('div');

      // Mock properties that JSDOM usually sets to 0
      Object.defineProperty(container, 'clientLeft', { value: 5 });
      Object.defineProperty(container, 'clientTop', { value: 5 });

      container.getBoundingClientRect = vi.fn(() => ({
        left: 10,
        top: 10,
        right: 110,
        bottom: 110,
        width: 100,
        height: 100,
        x: 10,
        y: 10,
        toJSON: () => {}
      }));

      // Event at 20, 20
      // Expected: 20 - 10 (rect) - 5 (border) = 5
      const event = {
        clientX: 20,
        clientY: 20,
        type: 'click'
      } as unknown as MouseEvent;

      const pos = L.DomEvent.getMousePosition(event, container);

      expect(pos.x).toBe(5);
      expect(pos.y).toBe(5);
    });
  });

  describe('L.Map.getSize', () => {
    it('should respect mocked clientWidth/clientHeight', () => {
      const map = L.map(document.createElement('div'));
      const container = map.getContainer();

      // Mock dimensions
      Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });

      map.invalidateSize();

      const size = map.getSize();
      expect(size.x).toBe(800);
      expect(size.y).toBe(600);
    });

    it('should respect mocked getBoundingClientRect if client dimensions are zero', () => {
      const map = L.map(document.createElement('div'));
      const container = map.getContainer();

      // clientWidth/Height are 0 by default in JSDOM

      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 500, bottom: 400,
        width: 500, height: 400,
        x: 0, y: 0,
        toJSON: () => {}
      }));

      map.invalidateSize();

      const size = map.getSize();
      expect(size.x).toBe(500);
      expect(size.y).toBe(400);
    });

    it('should fall back to headless size if no DOM dimensions available', () => {
      const map = L.map(document.createElement('div'), {
        mapSize: { width: 200, height: 200 }
      });

      // No mocks applied

      map.invalidateSize();
      const size = map.getSize();
      expect(size.x).toBe(200);
      expect(size.y).toBe(200);
    });
  });

  describe('L.DomEvent.on (Event Listeners)', () => {
    it('should use native addEventListener', () => {
      const element = document.createElement('div');
      const spy = vi.spyOn(element, 'addEventListener');
      const handler = () => {};

      L.DomEvent.on(element, 'click', handler);

      expect(spy).toHaveBeenCalledWith('click', expect.any(Function), false);
    });

    it('should trigger handler when event is dispatched', () => {
      const element = document.createElement('div');
      const handler = vi.fn();

      L.DomEvent.on(element, 'click', handler);

      element.dispatchEvent(new window.Event('click'));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('L.Map Interaction', () => {
    it('should correctly translate event coordinates to container point', () => {
      const container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);

      // Mock layout metrics
      Object.defineProperty(container, 'clientWidth', { configurable: true, value: 800 });
      Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
      container.getBoundingClientRect = vi.fn(() => ({
        top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => {}
      }));

      const map = L.map(container).setView([0, 0], 10);
      const clickSpy = vi.fn();

      map.on('click', (e: L.LeafletMouseEvent) => {
        clickSpy(e.containerPoint);
      });

      // Simulate click at (400, 300)
      const event = new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 300,
        button: 0
      });

      container.dispatchEvent(event);

      expect(clickSpy).toHaveBeenCalled();
      const point = clickSpy.mock.calls[0][0];

      expect(point.x).toBe(400);
      expect(point.y).toBe(300);

      map.remove();
      document.body.removeChild(container);
    });
  });
});
