/**
 * Custom Image implementation for headless environments
 * Supports loading images from HTTP/HTTPS URLs and local file paths
 */

import './polyfills/apply.js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { Image as CanvasImage } from '@napi-rs/canvas';
import { EnvHttpProxyAgent, fetch, type Dispatcher } from 'undici';

/**
 * Identifies leaflet-node to tile servers. Many providers (including the
 * OpenStreetMap tile servers) reject requests without a descriptive User-Agent.
 */
export const DEFAULT_USER_AGENT = 'leaflet-node (+https://github.com/jburnhams/leaflet-node)';

/** Requests for a single image are aborted after this many milliseconds. */
export const IMAGE_REQUEST_TIMEOUT_MS = 30_000;

let cachedDispatcher: { key: string; dispatcher: Dispatcher | null } | undefined;

function readEnv(...names: string[]): string | undefined {
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  for (const name of names) {
    const value = env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Build an undici dispatcher from the standard proxy environment variables.
 *
 * - `HTTP_PROXY` is used for http:// URLs, `HTTPS_PROXY` for https:// URLs
 *   (falling back to `HTTP_PROXY`), and `ALL_PROXY` for either.
 * - `NO_PROXY` hosts bypass the proxy.
 *
 * The dispatcher is cached per configuration, so changing the variables at
 * runtime takes effect on the next request.
 */
export function resolveProxyDispatcher(): Dispatcher | null {
  const allProxy = readEnv('ALL_PROXY', 'all_proxy');
  const httpProxy = readEnv('HTTP_PROXY', 'http_proxy') ?? allProxy;
  const httpsProxy = readEnv('HTTPS_PROXY', 'https_proxy') ?? httpProxy;
  const noProxy = readEnv('NO_PROXY', 'no_proxy') ?? '';
  const key = JSON.stringify([httpProxy, httpsProxy, noProxy]);

  if (cachedDispatcher?.key === key) {
    return cachedDispatcher.dispatcher;
  }

  const dispatcher =
    httpProxy || httpsProxy ? new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy }) : null;

  const previous = cachedDispatcher?.dispatcher;
  cachedDispatcher = { key, dispatcher };
  void previous?.close().catch(() => {});

  return dispatcher;
}

import type { HeadlessImage } from './types.js';

/**
 * Remove query string from URL
 */
function stripQuerystring(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex !== -1 ? url.substring(0, queryIndex) : url;
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load image from HTTP/HTTPS URL
 */
async function loadFromUrl(url: string): Promise<Buffer> {
  const dispatcher = resolveProxyDispatcher();
  const response = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    ...(dispatcher ? { dispatcher } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Load image from local file system
 */
async function loadFromFile(path: string): Promise<Buffer> {
  const cleanPath = stripQuerystring(path);

  if (!(await fileExists(cleanPath))) {
    throw new Error(`Could not find image: ${cleanPath}`);
  }

  return await fs.readFile(cleanPath);
}

/**
 * Convert a file:// URL to a filesystem path, decoding escapes such as %20 and
 * handling Windows drive letters. Malformed URLs fall back to stripping the scheme.
 */
function fileUrlToPath(src: string): string {
  try {
    return fileURLToPath(stripQuerystring(src));
  } catch {
    return src.substring('file://'.length);
  }
}

/**
 * Load image data from supported sources and return a CanvasImage
 */
export async function loadImageSource(src: string): Promise<CanvasImage> {
  let buffer: Buffer;

  if (src.startsWith('https://') || src.startsWith('http://')) {
    buffer = await loadFromUrl(src);
  } else if (src.startsWith('data:')) {
    const commaIndex = src.indexOf(',');

    if (commaIndex === -1) {
      throw new Error('Invalid data URI provided');
    }

    const isBase64 = src.lastIndexOf(';base64,', commaIndex) !== -1;
    const data = src.substring(commaIndex + 1);
    buffer = Buffer.from(data, isBase64 ? 'base64' : 'utf-8');
  } else if (src.startsWith('file://')) {
    buffer = await loadFromFile(fileUrlToPath(src));
  } else {
    buffer = await loadFromFile(src);
  }

  return await bufferToImage(buffer);
}

/**
 * Convert buffer to canvas Image
 */
async function bufferToImage(buffer: Buffer): Promise<CanvasImage> {
  return await new Promise<CanvasImage>((resolve, reject) => {
    const image = new CanvasImage();
    image.onload = () => resolve(image);
    image.onerror = (error: unknown) =>
      reject(error instanceof Error ? error : new Error(`Failed to decode image: ${String(error)}`));
    image.src = buffer;
  });
}

/**
 * Custom Image class for jsdom environment
 */
class Image implements HeadlessImage {
  private _src: string = '';
  public onload?: () => void;
  public onerror?: (error: Error) => void;
  public width?: number;
  public height?: number;

  get src(): string {
    return this._src;
  }

  set src(value: string) {
    this._src = value;

    // Load image asynchronously
    this.loadImage(value).catch((error) => {
      console.error('Error loading image:', error);
      if (this.onerror) {
        this.onerror(error as Error);
      }
    });
  }

  private async loadImage(src: string): Promise<void> {
    const canvasImage = await loadImageSource(src);

    // Copy properties to this instance
    this.width = canvasImage.width;
    this.height = canvasImage.height;

    // Call onload handler if provided
    if (this.onload) {
      // Bind to canvas image context for compatibility
      this.onload.call(canvasImage);
    }
  }
}

export default Image;
