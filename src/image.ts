/**
 * Custom Image implementation for headless environments
 * Supports loading images from HTTP/HTTPS URLs and local file paths
 */

import './polyfills/apply.js';
import { promises as fs } from 'fs';
import { Image as CanvasImage } from '@napi-rs/canvas';
import { ProxyAgent, fetch, type Dispatcher } from 'undici';

let cachedDispatcher: Dispatcher | null | undefined;

async function resolveProxyDispatcher(): Promise<Dispatcher | null> {
  if (cachedDispatcher !== undefined) {
    return cachedDispatcher;
  }

  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  const proxyUrl =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    env.ALL_PROXY ||
    env.all_proxy ||
    null;

  if (proxyUrl) {
    cachedDispatcher = new ProxyAgent(proxyUrl);
  } else {
    cachedDispatcher = null;
  }
  return cachedDispatcher;
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
  const dispatcher = await resolveProxyDispatcher();
  const response = await fetch(url, dispatcher ? { dispatcher } : undefined);

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
    const filePath = src.substring(7);
    buffer = await loadFromFile(filePath);
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
    image.onerror = (error: unknown) => reject(error);
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
