import { createRequire } from 'module';

/**
 * Safely get import.meta.url using dynamic evaluation to avoid
 * bundler polyfills that crash when document.baseURI is 'about:blank'
 */
export function getImportMetaUrlSafely(): string | undefined {
  try {
    // Use eval to get import.meta.url dynamically to prevent bundler from creating
    // a module-level polyfill that crashes with 'about:blank'
    // eslint-disable-next-line no-eval
    return eval('import.meta.url');
  } catch {
    return undefined;
  }
}

/**
 * Get a require function that works in both Node.js and jsdom environments
 * In jsdom, import.meta.url may be an HTTP URL or document.baseURI may be invalid (like 'about:blank')
 *
 * This function must be careful to avoid referencing import.meta.url when document exists,
 * because the bundler's polyfill for import.meta.url can crash when document.baseURI is 'about:blank'
 */
export function getSafeRequire(): NodeJS.Require {
  // Check if we're in a DOM environment (jsdom or browser)
  // In Node.js, document is undefined. In jsdom/browser, document exists.
  const hasDocument = typeof document !== 'undefined';

  // Use eval('require') if we detect jsdom to avoid issues with import.meta.url polyfill
  // The bundler's polyfill for import.meta.url can fail when document.baseURI is 'about:blank'
  // However, in Jest with ESM, require might not be available, so we need to check
  if (hasDocument) {
    try {
      // In jsdom environment, use eval('require') to get the require function
      // eslint-disable-next-line no-eval
      const req = eval('require') as NodeJS.Require;
      // Verify that require actually works
      if (typeof req === 'function' && typeof req.resolve === 'function') {
        return req;
      }
    } catch {
      // require is not available (e.g., Jest with ESM), fall through to other methods
    }
  }

  // Get import.meta.url safely without triggering bundler polyfills
  const importMetaUrl = getImportMetaUrlSafely();

  // If we can't get import.meta.url, try alternative approaches
  if (!importMetaUrl) {
    // Try eval('require') first
    try {
      // eslint-disable-next-line no-eval
      return eval('require') as NodeJS.Require;
    } catch {
      // require not available in eval context
    }

    // Try using __filename if available (CommonJS or some ESM shims)
    if (typeof __filename !== 'undefined') {
      try {
        return createRequire(__filename);
      } catch {
        // __filename is not a valid path for createRequire
      }
    }

    // Try using process.cwd() as a last resort
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      try {
        // Create a file URL from the current working directory
        const cwdUrl = new URL(`file://${process.cwd()}/`).href;
        return createRequire(cwdUrl);
      } catch {
        // process.cwd() approach failed
      }
    }

    // If all else fails, throw an error
    throw new Error('Cannot get require function: neither require nor import.meta.url are available');
  }

  // Check if import.meta.url looks like it's from jsdom (HTTP/HTTPS)
  const importMetaUrlIsHttp = importMetaUrl.startsWith('http://') ||
                              importMetaUrl.startsWith('https://');

  // For HTTP URLs (from jsdom), try eval('require') first since createRequire won't work
  // But if that fails, still attempt createRequire as a last resort
  if (importMetaUrlIsHttp) {
    try {
      // eslint-disable-next-line no-eval
      return eval('require') as NodeJS.Require;
    } catch {
      // require is not available (e.g., Jest with ESM)
      // Fall through to try createRequire anyway - it will likely fail but might work
      // in some edge cases
    }
  }

  // Use createRequire() for file:// URLs or as a last resort for HTTP URLs
  // For HTTP URLs, this will likely throw, but that's the best we can do
  return createRequire(importMetaUrl);
}
