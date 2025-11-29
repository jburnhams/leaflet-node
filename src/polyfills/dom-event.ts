
import type * as LeafletModule from 'leaflet';

/**
 * Patch L.DomEvent to handle removal of listeners from objects that lack removeEventListener.
 * This fixes an issue with @napi-rs/canvas elements in some environments where Leaflet falls back
 * to detachEvent (which is also missing), causing a crash.
 */
export function patchDomEvent(L: typeof LeafletModule): void {
  if (!L || !L.DomEvent) {
    return;
  }

  // Avoid re-patching if already patched
  if ((L.DomEvent as any)._leafletNodePatched) {
    return;
  }

  const originalOff = L.DomEvent.off;

  // Store original on the object to avoid closure issues in some environments (like Jest)
  // This seems to prevent a silent crash during module import in specific test configurations
  (L.DomEvent as any)._originalOff = originalOff;

  // We use ...args to preserve arguments.length, which Leaflet relies on internally
  // to distinguish between off(obj, type, fn) and off(obj, type)
  L.DomEvent.off = function(this: any, ...args: any[]) {
    try {
      return (L.DomEvent as any)._originalOff.apply(this, args);
    } catch (e: any) {
      // Swallow "detachEvent is not a function" errors
      // This happens when Leaflet tries to clean up a Canvas element that lacks event methods
      // or when it detects an environment that looks like IE
      if (e instanceof TypeError && (e.message.includes('detachEvent') || e.message.includes('not a function'))) {
        return this;
      }
      throw e;
    }
  } as typeof originalOff;

  // Mark as patched
  (L.DomEvent as any)._leafletNodePatched = true;

  // Alias removeListener as well if needed
  if ((L.DomEvent as any).removeListener === originalOff) {
    (L.DomEvent as any).removeListener = L.DomEvent.off;
  }
}
