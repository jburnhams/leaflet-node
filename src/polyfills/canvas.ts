import { Canvas, createCanvas } from '@napi-rs/canvas';

/**
 * Patches the @napi-rs/canvas Canvas prototype to include DOM-like event methods.
 * This is necessary because Leaflet sometimes tries to attach/detach events on the canvas
 * element (e.g. for vector layers), but the N-API canvas instance doesn't inherit from
 * HTMLElement or EventTarget in the same way JSDOM elements do.
 */
export function ensureCanvasPolyfills(): void {
  // Method 1: Patch the exported class prototype (if it matches)
  if (Canvas && Canvas.prototype) {
    patchPrototype(Canvas.prototype);
  }

  // Method 2: Patch the prototype of an actual instance
  // This is required because in some environments/versions, the exported Canvas class
  // might not be the direct constructor of the instances returned by createCanvas.
  try {
    const dummy = createCanvas(1, 1);
    const proto = Object.getPrototypeOf(dummy);
    if (proto && proto !== Canvas?.prototype) {
       patchPrototype(proto);
    }
  } catch (e) {
    // Ignore errors if createCanvas fails (e.g. missing dependencies)
  }
}

function patchPrototype(proto: any) {
    if (typeof proto.addEventListener !== 'function') {
      proto.addEventListener = function(_type: string, _listener: any, _options?: any) {
        // No-op
      };
    }

    if (typeof proto.removeEventListener !== 'function') {
      proto.removeEventListener = function(_type: string, _listener: any, _options?: any) {
        // No-op
      };
    }

    if (typeof proto.attachEvent !== 'function') {
        proto.attachEvent = function() {
            // No-op
        }
    }

    if (typeof proto.detachEvent !== 'function') {
        proto.detachEvent = function() {
            // No-op
        }
    }
}
