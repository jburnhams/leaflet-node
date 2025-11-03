/**
 * Leaflet-node: Run Leaflet in Node.js environments
 *
 * This module sets up a fake DOM environment using jsdom to enable
 * Leaflet to run in Node.js for server-side map generation, testing,
 * and headless rendering.
 */

import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import type * as LeafletModule from 'leaflet';
import type { LeafletHeadlessMap, HeadlessOptions } from './types.js';
import HeadlessImage, { loadImageSource } from './image.js';
import { mapToCanvas } from './export-image.js';
import { ensureDefaultFontsRegistered } from './fonts.js';
import { ensureReadableStream } from './polyfills/readable-stream.js';

ensureReadableStream();

// Extend global namespace for headless environment
declare global {
  // eslint-disable-next-line no-var
  var L_DISABLE_3D: boolean;
  // eslint-disable-next-line no-var
  var L_NO_TOUCH: boolean;
}

/**
 * Default options for headless environment
 */
type ResolvedHeadlessOptions =
  Required<Omit<HeadlessOptions, 'fontAssetBasePath'>> & Pick<HeadlessOptions, 'fontAssetBasePath'>;

const DEFAULT_OPTIONS: ResolvedHeadlessOptions = {
  mapSize: { width: 1024, height: 1024 },
  enableAnimations: false,
  userAgent: 'webkit',
};

/**
 * Initialize the headless environment (called automatically)
 */
function initializeEnvironment(options: HeadlessOptions = {}): typeof LeafletModule {
  const opts: ResolvedHeadlessOptions = { ...DEFAULT_OPTIONS, ...options };

  ensureDefaultFontsRegistered(opts.fontAssetBasePath);

  // Return existing Leaflet instance if already initialized
  if ((global as any).L) {
    return (global as any).L;
  }

  // Create fake DOM environment using jsdom
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
    resources: 'usable',
  });

  // Set up global environment
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).Image = HeadlessImage;
  (dom.window as any).Image = HeadlessImage;

  // Ensure HTMLImageElement loads resources through our headless loader
  const imagePrototype = dom.window.HTMLImageElement.prototype as any;
  const originalSrcDescriptor = Object.getOwnPropertyDescriptor(imagePrototype, 'src');

  Object.defineProperty(imagePrototype, 'src', {
    configurable: true,
    enumerable: true,
    get() {
      if (originalSrcDescriptor?.get) {
        return originalSrcDescriptor.get.call(this);
      }
      return this.getAttribute('src') ?? '';
    },
    set(value: string) {
      if (originalSrcDescriptor?.set) {
        originalSrcDescriptor.set.call(this, value);
      } else {
        this.setAttribute('src', value);
      }

      const load = async () => {
        try {
          const canvasImage = await loadImageSource(value);
          (this as any)._napiImage = canvasImage;
          this.width = canvasImage.width;
          this.height = canvasImage.height;
          const loadEvent = new dom.window.Event('load');
          this.dispatchEvent(loadEvent);
        } catch (error) {
          const errorEvent = new dom.window.Event('error');
          (errorEvent as any).error = error;
          this.dispatchEvent(errorEvent);
        }
      };

      load().catch((error) => {
        console.error('Error loading image element:', error);
      });
    }
  });

  // Set navigator (read-only, needs defineProperty)
  if (!(global as any).navigator) {
    Object.defineProperty(global, 'navigator', {
      value: dom.window.navigator,
      writable: true,
      configurable: true
    });
  }

  // Polyfill HTMLCanvasElement with @napi-rs/canvas
  const OriginalHTMLCanvasElement = dom.window.HTMLCanvasElement;
  const proto = OriginalHTMLCanvasElement.prototype as any;

  // Override createElement to use @napi-rs/canvas for canvas elements
  const originalCreateElement = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = function(tagName: string, options?: any) {
    const element = originalCreateElement(tagName, options);

    if (tagName.toLowerCase() === 'canvas') {
      const width = (element as any).width || 300;
      const height = (element as any).height || 150;
      const napiCanvas = createCanvas(width, height);

      // Copy canvas methods to the DOM element
      (element as any).getContext = function(contextType: string, options?: any) {
        if (contextType === '2d') {
          return napiCanvas.getContext('2d', options);
        }
        return null;
      };

      (element as any).toDataURL = function(type?: string, quality?: any) {
        return (napiCanvas as any).toDataURL(type, quality);
      };

      (element as any).toBuffer = function(mimeType?: string, quality?: any) {
        return (napiCanvas as any).toBuffer(mimeType, quality);
      };

      // Link width and height properties
      Object.defineProperty(element, 'width', {
        get() { return napiCanvas.width; },
        set(value) { napiCanvas.width = value; }
      });

      Object.defineProperty(element, 'height', {
        get() { return napiCanvas.height; },
        set(value) { napiCanvas.height = value; }
      });

      // Store reference to napi canvas
      (element as any)._napiCanvas = napiCanvas;
    }

    return element;
  };

  // Navigator is already available through window

  // Configure Leaflet for headless mode
  global.L_DISABLE_3D = true;
  global.L_NO_TOUCH = true;

  // Set user agent
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    value: opts.userAgent,
    writable: true,
  });

  // Load Leaflet
  const leafletPath = require.resolve('leaflet');
  const L = require(leafletPath) as typeof LeafletModule;
  (global as any).L = L;

  // Set icon path for markers
  const scriptName = leafletPath.split(path.sep).pop() || '';
  const leafletDir = leafletPath.substring(0, leafletPath.length - scriptName.length);
  L.Icon.Default.imagePath = `file://${leafletDir}images${path.sep}`;

  // Monkey-patch L.Map.prototype
  patchMapPrototype(L, opts);

  return L;
}

/**
 * Apply patches to Leaflet Map prototype for headless operation
 */
function patchMapPrototype(
  L: typeof LeafletModule,
  options: ResolvedHeadlessOptions
): void {
  const originalInit = (L.Map.prototype as any).initialize;

  // Override initialize to set headless-friendly defaults
  (L.Map.prototype as any).initialize = function (
    id: string | HTMLElement,
    opts?: LeafletModule.MapOptions
  ) {
    const headlessOpts: LeafletModule.MapOptions = {
      ...opts,
      fadeAnimation: options.enableAnimations,
      zoomAnimation: options.enableAnimations,
      markerZoomAnimation: options.enableAnimations,
      preferCanvas: true,
    };

    const mapInstance = originalInit.call(this, id, headlessOpts);
    (this as any)._headlessSize = { ...options.mapSize };
    return mapInstance;
  };

  // Override getSize since jsdom doesn't support clientWidth/clientHeight
  L.Map.prototype.getSize = function (this: any): LeafletModule.Point {
    if (!this._size || this._sizeChanged) {
      const size = (this as any)._headlessSize ?? options.mapSize;
      this._size = new L.Point(size.width, size.height);
      this._sizeChanged = false;
    }
    return this._size.clone();
  };

  // Add setSize method
  (L.Map.prototype as any).setSize = function (
    this: any,
    width: number,
    height: number
  ): LeafletHeadlessMap {
    this._size = new L.Point(width, height);
    this._sizeChanged = false;
    (this as any)._headlessSize = { width, height };

    const container = this.getContainer?.();
    if (container && typeof container === 'object') {
      (container as HTMLElement).style.width = `${width}px`;
      (container as HTMLElement).style.height = `${height}px`;
    }

    if (this.options) {
      (this.options as any).mapSize = { width, height };
    }

    // Reset pixel origin to recalculate map position
    this._resetView(this.getCenter(), this.getZoom());
    return this as LeafletHeadlessMap;
  };

  // Add saveImage method (async version)
  (L.Map.prototype as any).saveImage = async function (
    this: any,
    filename: string
  ): Promise<string> {
    try {
      const canvas = await mapToCanvas(this);
      const buffer = canvas.toBuffer('image/png');

      await fs.writeFile(filename, buffer);
      return filename;
    } catch (err) {
      throw new Error(`Failed to save map image: ${(err as Error).message}`);
    }
  };

  // Add toBuffer method for in-memory image generation
  (L.Map.prototype as any).toBuffer = async function (
    this: any,
    format: 'png' | 'jpeg' = 'png'
  ): Promise<Buffer> {
    try {
      const canvas = await mapToCanvas(this);
      // @napi-rs/canvas has separate overloads for PNG and JPEG
      if (format === 'jpeg') {
        return canvas.toBuffer('image/jpeg');
      } else {
        return canvas.toBuffer('image/png');
      }
    } catch (err) {
      throw new Error(`Failed to export map to buffer: ${(err as Error).message}`);
    }
  };
}

// Initialize environment on module load
const L = initializeEnvironment();

// Export typed Leaflet with headless extensions
export default L;
export type { LeafletHeadlessMap, HeadlessOptions } from './types.js';
