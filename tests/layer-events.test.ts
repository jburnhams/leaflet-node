import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import L from '../src/index.js';
import { ensureTileFixture, getTileFixtureUrl } from './helpers/tile-fixture.js';

/**
 * Layer Events Tests
 *
 * Tests layer management events to ensure they fire correctly in Node.js with jsdom.
 * Covers layer addition, removal, and control events.
 */
describe('Layer Events', () => {
  let element: HTMLDivElement;
  let map: L.Map;
  const canvas = L.canvas ? L.canvas() : undefined;
  const lat = 52.4;
  const lng = 4.5;
  const latlng: L.LatLngExpression = [lat, lng];

  beforeAll(async () => {
    await ensureTileFixture();
  });

  beforeEach(() => {
    element = document.createElement('div');
    element.id = 'layer-events-test';
    document.body.appendChild(element);
    map = L.map(element.id);
    map.setView(latlng, 10);
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

  describe('Layer addition events', () => {
    it('fires "layeradd" event when adding a marker', async () => {
      const layeraddSpy = vi.fn();
      map.on('layeradd', layeraddSpy);

      const marker = L.marker(latlng);
      map.addLayer(marker);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(layeraddSpy).toHaveBeenCalled();
      const event = layeraddSpy.mock.calls[0][0];
      expect(event.type).toBe('layeradd');
      expect(event.layer).toBe(marker);
    });

    it('fires "layeradd" event when adding a tile layer', async () => {
      const layeraddSpy = vi.fn();
      map.on('layeradd', layeraddSpy);

      const tileLayer = L.tileLayer(getTileFixtureUrl());
      map.addLayer(tileLayer);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(layeraddSpy).toHaveBeenCalled();
      const event = layeraddSpy.mock.calls[0][0];
      expect(event.type).toBe('layeradd');
      expect(event.layer).toBe(tileLayer);
    });

    it('fires "layeradd" event when adding vector layers', async () => {
      const layeraddSpy = vi.fn();
      map.on('layeradd', layeraddSpy);

      const polyline = L.polyline(
        [
          [52, 4],
          [54, 6],
        ],
        { renderer: canvas }
      );
      map.addLayer(polyline);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(layeraddSpy).toHaveBeenCalled();
    });
  });

  describe('Layer removal events', () => {
    it('fires "layerremove" event when removing a marker', async () => {
      const marker = L.marker(latlng);
      map.addLayer(marker);

      await new Promise(resolve => setTimeout(resolve, 100));

      const layerremoveSpy = vi.fn();
      map.on('layerremove', layerremoveSpy);

      map.removeLayer(marker);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(layerremoveSpy).toHaveBeenCalled();
      const event = layerremoveSpy.mock.calls[0][0];
      expect(event.type).toBe('layerremove');
      expect(event.layer).toBe(marker);
    });
  });

  describe('Popup events', () => {
    it('fires "popupopen" event when popup is opened', async () => {
      const popupopenSpy = vi.fn();
      const marker = L.marker(latlng);
      marker.bindPopup('Test popup');

      map.addLayer(marker);
      marker.on('popupopen', popupopenSpy);

      marker.openPopup();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(popupopenSpy).toHaveBeenCalled();
    });

    it('fires "popupclose" event when popup is closed', async () => {
      const popupcloseSpy = vi.fn();
      const marker = L.marker(latlng);
      marker.bindPopup('Test popup');

      map.addLayer(marker);
      marker.openPopup();

      await new Promise(resolve => setTimeout(resolve, 100));

      marker.on('popupclose', popupcloseSpy);
      marker.closePopup();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(popupcloseSpy).toHaveBeenCalled();
    });
  });

  describe('Tooltip events', () => {
    it('fires "tooltipopen" event when tooltip is opened', async () => {
      const tooltipopenSpy = vi.fn();
      const marker = L.marker(latlng);
      marker.bindTooltip('Test tooltip');

      map.addLayer(marker);
      marker.on('tooltipopen', tooltipopenSpy);

      marker.openTooltip();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(tooltipopenSpy).toHaveBeenCalled();
    });

    it('fires "tooltipclose" event when tooltip is closed', async () => {
      const tooltipcloseSpy = vi.fn();
      const marker = L.marker(latlng);
      marker.bindTooltip('Test tooltip');

      map.addLayer(marker);
      marker.openTooltip();

      await new Promise(resolve => setTimeout(resolve, 100));

      marker.on('tooltipclose', tooltipcloseSpy);
      marker.closeTooltip();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(tooltipcloseSpy).toHaveBeenCalled();
    });
  });
});
