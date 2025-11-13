/**
 * Leaflet-node: Run Leaflet in Node.js environments
 *
 * This module sets up a fake DOM environment using jsdom to enable
 * Leaflet to run in Node.js for server-side map generation, testing,
 * and headless rendering.
 */

import './polyfills/apply.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'module';
import type * as LeafletModule from 'leaflet';
import type { LeafletHeadlessMap, HeadlessOptions, ImageExportOptions } from './types.js';
import HeadlessImage, { loadImageSource } from './image.js';
import { mapToCanvas } from './export-image.js';
import { ensureDefaultFontsRegistered } from './fonts.js';

/**
 * Get a require function that works in both Node.js and jsdom environments
 * In jsdom, import.meta.url is set to an HTTP URL which causes createRequire to fail
 */
function getSafeRequire(): NodeJS.Require {
  const isJsdom = import.meta.url?.startsWith('http://') ||
                  import.meta.url?.startsWith('https://');

  if (isJsdom) {
    // In jsdom environment, use eval('require') to get the require function
    // eslint-disable-next-line no-eval
    return eval('require') as NodeJS.Require;
  } else {
    // Use createRequire() as normal for Node.js
    return createRequire(import.meta.url);
  }
}

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

  ensureDefaultFontsRegistered(opts.fontAssetBasePath, {
    suppressWarningsUntilConfigured: typeof opts.fontAssetBasePath === 'undefined',
  });

  // Return existing Leaflet instance if already initialized
  if ((global as any).L) {
    return (global as any).L;
  }

  // Detect if a DOM environment already exists (e.g., from test framework)
  const existingDocument = (global as any).document;
  const existingWindow = (global as any).window;
  const hasExistingDom = existingDocument && existingWindow;

  let dom: { window: any };

  if (hasExistingDom) {
    // Reuse existing DOM instance from test framework (e.g., Jest with jsdom)
    // Don't try to create a new JSDOM instance to avoid conflicts
    dom = {
      window: existingWindow
    };
  } else {
    // Create new fake DOM environment using jsdom
    // Use getSafeRequire to support both CommonJS and ESM environments
    const requireFn = getSafeRequire();
    const { JSDOM } = requireFn('jsdom');
    const jsdomInstance = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: 'http://localhost',
      pretendToBeVisual: true,
      resources: 'usable',
    });

    // Set up global environment
    (global as any).document = jsdomInstance.window.document;
    (global as any).window = jsdomInstance.window;

    dom = { window: jsdomInstance.window };
  }

  // Set up Image polyfill regardless of whether DOM was existing or new
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
        const timeoutMs = 30000; // 30 second timeout
        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Image load timeout after ${timeoutMs}ms: ${value}`));
          }, timeoutMs);
        });

        try {
          // Race between loading the image and the timeout
          const canvasImage = await Promise.race([
            loadImageSource(value),
            timeoutPromise
          ]);

          (this as any)._napiImage = canvasImage;
          this.width = canvasImage.width;
          this.height = canvasImage.height;

          const loadEvent = new dom.window.Event('load');
          this.dispatchEvent(loadEvent);
        } catch (error) {
          // Enhanced error logging for debugging
          console.error('Image load failed:', {
            src: value,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });

          // Always dispatch error event to prevent silent hangs
          const errorEvent = new dom.window.Event('error');
          (errorEvent as any).error = error;
          this.dispatchEvent(errorEvent);
        } finally {
          // Clear the timeout to prevent keeping the process alive
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
          }
        }
      };

      // Invoke load without additional catch to avoid double error handling
      load();
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
      let napiCanvas;
      try {
        napiCanvas = createCanvas(width, height);
      } catch (error) {
        const hint = new Error(
          'leaflet-node: Canvas initialization failed. Ensure @napi-rs/canvas is installed correctly. ' +
          'If you are running tests with Jest, use @jest-environment node or import leaflet-node before jsdom is created.'
        );
        (hint as any).cause = error;
        console.error('leaflet-node: Canvas initialization failed', error);
        throw hint;
      }

      const probeContext = napiCanvas.getContext('2d');
      if (!probeContext) {
        const message = [
          'leaflet-node: Canvas context could not be created.',
          'If you are running under a test runner, ensure @jest-environment node is used or import leaflet-node before jsdom initializes.',
        ].join(' ');
        console.error(message);
        throw new Error(message);
      }

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
  const requireFn = getSafeRequire();
  const leafletPath = requireFn.resolve('leaflet');
  const L = requireFn(leafletPath) as typeof LeafletModule;
  (global as any).L = L;

  // Set icon path for markers
  // Note: L.Icon.Default may not be initialized yet in some environments (e.g., Jest/jsdom)
  // In those cases, we can skip setting the image path as it will be set when the first icon is created
  if (L.Icon && L.Icon.Default) {
    const scriptName = leafletPath.split(path.sep).pop() || '';
    const leafletDir = leafletPath.substring(0, leafletPath.length - scriptName.length);
    L.Icon.Default.imagePath = `file://${leafletDir}images${path.sep}`;
  }

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
    filename: string,
    options: ImageExportOptions = {}
  ): Promise<string> {
    try {
      const buffer = await (this as LeafletHeadlessMap).toBuffer(options.format ?? 'png', options.quality);

      await fs.writeFile(filename, buffer);
      return filename;
    } catch (err) {
      throw new Error(`Failed to save map image: ${(err as Error).message}`);
    }
  };

  // Add toBuffer method for in-memory image generation
  (L.Map.prototype as any).toBuffer = async function (
    this: any,
    format: 'png' | 'jpeg' = 'png',
    quality?: number
  ): Promise<Buffer> {
    try {
      const canvas = await mapToCanvas(this);
      // @napi-rs/canvas has separate overloads for PNG and JPEG
      if (format === 'jpeg') {
        if (typeof quality === 'number') {
          return canvas.toBuffer('image/jpeg', quality);
        }
        return canvas.toBuffer('image/jpeg');
      }
      if (typeof quality === 'number') {
        console.warn(
          'leaflet-node: PNG quality is not supported; ignoring provided quality value.'
        );
      }
      return canvas.toBuffer('image/png');
    } catch (err) {
      throw new Error(`Failed to export map to buffer: ${(err as Error).message}`);
    }
  };

  const originalRemove = L.Map.prototype.remove;
  if (typeof originalRemove === 'function') {
    L.Map.prototype.remove = function (this: L.Map) {
      try {
        this.eachLayer?.((layer: any) => {
          const renderer = layer?._renderer;
          if (renderer && renderer._frame) {
            if (typeof L.Util?.cancelAnimFrame === 'function') {
              L.Util.cancelAnimFrame(renderer._frame);
            }
            renderer._frame = null;
          }
        });
      } catch (cleanupError) {
        console.warn('leaflet-node: error during map cleanup', cleanupError);
      }

      return originalRemove.call(this);
    } as typeof originalRemove;
  }
}

// Initialize environment on module load
const L = initializeEnvironment();

// Export typed Leaflet with headless extensions
export default L;
export { initializeEnvironment };
export type { LeafletHeadlessMap, HeadlessOptions, ImageExportOptions } from './types.js';
export { setFontAssetBasePath } from './fonts.js';
