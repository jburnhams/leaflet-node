
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
  const originalGetMousePosition = L.DomEvent.getMousePosition;

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

  // Patch getMousePosition to support JSDOM environments where getBoundingClientRect works
  // but offsetParent/clientLeft/clientTop layout properties might not be perfect
  // Use 'any' for the event type to avoid TypeScript issues if Touch is not defined globally in strict environments
  L.DomEvent.getMousePosition = function(e: any, container?: HTMLElement): LeafletModule.Point {
    if (container && container.getBoundingClientRect) {
      const rect = container.getBoundingClientRect();
      const clientLeft = container.clientLeft || 0;
      const clientTop = container.clientTop || 0;

      return new L.Point(
        e.clientX - rect.left - clientLeft,
        e.clientY - rect.top - clientTop
      );
    }

    // Fallback to original implementation if container doesn't have getBoundingClientRect
    // or if it's not provided (though Leaflet usually provides it)
    return originalGetMousePosition(e, container);
  };

  // Note: We don't need to patch addListener/removeListener because standard Leaflet
  // already checks for addEventListener/removeEventListener on the object.
  // Since we run in JSDOM (which has these), standard Leaflet works fine.

  // Mark as patched
  (L.DomEvent as any)._leafletNodePatched = true;

  // Alias removeListener as well if needed
  if ((L.DomEvent as any).removeListener === originalOff) {
    (L.DomEvent as any).removeListener = L.DomEvent.off;
  }
}
