import type * as L from 'leaflet';

/**
 * Extended Map interface with headless-specific methods
 */
export interface LeafletHeadlessMap extends L.Map {
  /**
   * Set the size of the map canvas
   * @param width - Width in pixels
   * @param height - Height in pixels
   */
  setSize(width: number, height: number): this;

  /**
   * Save the current map view to an image file
   * @param filename - Output filename (e.g., 'map.png')
   * @param options - Optional export configuration
   * @returns Promise that resolves with the filename when complete
   */
  saveImage(filename: string, options?: ImageExportOptions): Promise<string>;

  /**
   * Export the current map view to a Buffer
    * @param format - Image format ('png' or 'jpeg')
   * @param quality - Optional quality hint (0-1 for JPEG)
   * @returns Promise that resolves with the image buffer
   */
  toBuffer(format?: 'png' | 'jpeg', quality?: number): Promise<Buffer>;
}

export interface ImageExportOptions {
  /**
   * Target image format
   * @default 'png'
   */
  format?: 'png' | 'jpeg';

  /**
   * Optional encoder quality (0-1 for JPEG, 0-1 for PNG in @napi-rs/canvas)
   */
  quality?: number;
}

/**
 * Options for initializing the headless environment
 */
export interface HeadlessOptions {
  /**
   * Default map size in pixels
   * @default { width: 1024, height: 1024 }
   */
  mapSize?: {
    width: number;
    height: number;
  };

  /**
   * Enable animations (disabled by default for performance)
   * @default false
   */
  enableAnimations?: boolean;

  /**
   * Custom user agent string
   * @default 'webkit'
   */
  userAgent?: string;

  /**
   * Base directory used to resolve bundled font assets when automatic detection fails.
   * Accepts an absolute path.
   */
  fontAssetBasePath?: string;
}

/**
 * Custom Image implementation for headless environments
 */
export interface HeadlessImage {
  src: string;
  onload?: () => void;
  onerror?: (error: Error) => void;
  width?: number;
  height?: number;
}

declare module 'leaflet' {
  interface Map {
    setSize(width: number, height: number): LeafletHeadlessMap;
    saveImage(filename: string, options?: ImageExportOptions): Promise<string>;
    toBuffer(format?: 'png' | 'jpeg', quality?: number): Promise<Buffer>;
  }
}
