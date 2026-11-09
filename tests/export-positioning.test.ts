import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import '../src/index.js';
import { mapToCanvas } from '../src/export-image.js';

/**
 * mapToCanvas composites every <img>/<canvas> in the map container. These tests
 * drive it with a minimal fake map so each CSS positioning path can be checked
 * pixel by pixel.
 */

const RED = `data:image/png;base64,${(() => {
  const canvas = createCanvas(2, 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 2, 2);
  return canvas.toBuffer('image/png').toString('base64');
})()}`;

function fakeMap(container: HTMLElement, width = 40, height = 40) {
  return {
    getSize: () => ({ x: width, y: height }),
    getContainer: () => container,
    getCenter: () => ({ lat: 0, lng: 0 }),
    _layers: {},
  };
}

function addImage(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('src', RED);
  img.style.width = '2px';
  img.style.height = '2px';
  Object.assign(img.style, style);
  parent.appendChild(img);
  return img;
}

async function redPixels(map: ReturnType<typeof fakeMap>): Promise<Array<[number, number]>> {
  const canvas = await mapToCanvas(map);
  const { data, width, height } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
  const hits: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 200 && data[i + 1] < 50 && data[i + 3] > 200) {
        hits.push([x, y]);
      }
    }
  }
  return hits;
}

async function topLeftOf(style: Partial<CSSStyleDeclaration>, wrap?: Partial<CSSStyleDeclaration>) {
  const container = document.createElement('div');
  let parent: HTMLElement = container;
  if (wrap) {
    parent = document.createElement('div');
    Object.assign(parent.style, wrap);
    container.appendChild(parent);
  }
  addImage(parent, style);
  const hits = await redPixels(fakeMap(container));
  expect(hits.length).toBeGreaterThan(0);
  return hits[0];
}

describe('mapToCanvas element positioning', () => {
  it('uses left/top when no transform is set', async () => {
    expect(await topLeftOf({ left: '5px', top: '7px' })).toEqual([5, 7]);
  });

  it('adds margins to the position', async () => {
    expect(
      await topLeftOf({ left: '5px', top: '7px', marginLeft: '3px', marginTop: '2px' })
    ).toEqual([8, 9]);
  });

  it('reads translate3d transforms', async () => {
    expect(await topLeftOf({ transform: 'translate3d(10px, 12px, 0px)' })).toEqual([10, 12]);
  });

  it('reads translate transforms', async () => {
    expect(await topLeftOf({ transform: 'translate(4px, 6px)' })).toEqual([4, 6]);
  });

  it('reads translateX/translateY transforms', async () => {
    expect(await topLeftOf({ transform: 'translateX(9px) translateY(11px)' })).toEqual([9, 11]);
  });

  it('reads matrix transforms', async () => {
    expect(await topLeftOf({ transform: 'matrix(1, 0, 0, 1, 13, 15)' })).toEqual([13, 15]);
  });

  it('reads matrix3d transforms', async () => {
    expect(await topLeftOf({ transform: 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 3,4,0,1)' })).toEqual([
      3, 4,
    ]);
  });

  it('accumulates transforms from ancestor panes', async () => {
    expect(
      await topLeftOf(
        { transform: 'translate3d(2px, 3px, 0px)' },
        { transform: 'translate3d(10px, 20px, 0px)' }
      )
    ).toEqual([12, 23]);
  });

  it('prefers Leaflet _leaflet_pos over CSS', async () => {
    const container = document.createElement('div');
    const img = addImage(container, { transform: 'translate3d(30px, 30px, 0px)' });
    (img as any)._leaflet_pos = { x: 6, y: 8 };

    const hits = await redPixels(fakeMap(container));
    expect(hits[0]).toEqual([6, 8]);
  });

  it('skips images without a src and canvases without a native backing', async () => {
    const container = document.createElement('div');
    container.appendChild(document.createElement('img'));
    const orphanCanvas = document.createElement('canvas');
    delete (orphanCanvas as any)._napiCanvas;
    container.appendChild(orphanCanvas);
    addImage(container, { left: '1px', top: '1px' });

    const hits = await redPixels(fakeMap(container));
    expect(hits[0]).toEqual([1, 1]);
  });

  it('keeps exporting when one tile fails to decode', async () => {
    const container = document.createElement('div');
    const broken = document.createElement('img');
    broken.setAttribute('src', 'data:image/png;base64,AAAA');
    container.appendChild(broken);
    addImage(container, { left: '2px', top: '2px' });

    const hits = await redPixels(fakeMap(container));
    expect(hits[0]).toEqual([2, 2]);
  });

  it('throws a clear error when the container is missing', async () => {
    await expect(
      mapToCanvas({ getSize: () => ({ x: 1, y: 1 }), getContainer: () => null })
    ).rejects.toThrow(/container element is unavailable/);
  });
});
