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
   * @returns Promise that resolves with the filename when complete
   */
  saveImage(filename: string): Promise<string>;

  /**
   * Export the current map view to a Buffer
   * @param format - Image format ('png' or 'jpeg')
   * @returns Promise that resolves with the image buffer
   */
  toBuffer(format?: 'png' | 'jpeg'): Promise<Buffer>;
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
