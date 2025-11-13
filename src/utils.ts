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

  // If we can't get import.meta.url, fall back to eval('require')
  // This can happen in some test environments or edge cases
  if (!importMetaUrl) {
    try {
      // eslint-disable-next-line no-eval
      return eval('require') as NodeJS.Require;
    } catch {
      // If require is not available and we can't get import.meta.url,
      // we're in an unsupported environment
      throw new Error('Cannot get require function: neither require nor import.meta.url are available');
    }
  }

  // Check if import.meta.url looks like it's from jsdom (HTTP/HTTPS)
  const importMetaUrlIsHttp = importMetaUrl.startsWith('http://') ||
                              importMetaUrl.startsWith('https://');

  if (importMetaUrlIsHttp) {
    try {
      // eslint-disable-next-line no-eval
      return eval('require') as NodeJS.Require;
    } catch {
      // If require is not available in jsdom with HTTP URL,
      // we're in an unsupported environment (e.g., Jest with ESM)
      throw new Error('Cannot get require function: require is not available in this jsdom environment');
    }
  }

  // Use createRequire() as normal for Node.js
  return createRequire(importMetaUrl);
}
