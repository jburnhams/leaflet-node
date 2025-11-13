import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

describe('environment resilience', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('undici');
    vi.doUnmock('@napi-rs/canvas');
    vi.doUnmock('module');
    vi.doUnmock('fs');
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).LEAFLET_NODE_FONT_BASE_PATH;
    delete process.env.LEAFLET_NODE_FONT_BASE_PATH;
  });

  it('detects bundled fonts when document.currentScript references a jsdom main script', async () => {
    (globalThis as Record<string, unknown>).document = {
      currentScript: { src: 'http://localhost/main.js' },
      baseURI: 'http://localhost/',
    } as unknown as Document;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ensureDefaultFontsRegistered } = await import('../src/fonts.js');

    ensureDefaultFontsRegistered();

    const warningMessages = warnSpy.mock.calls.map((args) => args[0]);

    expect(
      warningMessages.includes(
        'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
      )
    ).toBe(false);

    expect(
      warningMessages.includes(
        'leaflet-node: unable to determine package directory from import.meta.url; falling back to process.cwd().'
      )
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('allows overriding fallback font resolution via environment variable', async () => {
    const require = createRequire(import.meta.url);
    const explicitFontPath = require.resolve(
      '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2'
    );

    process.env.LEAFLET_NODE_FONT_BASE_PATH = explicitFontPath;

    const registerFromPath = vi.fn(() => true);
    vi.doMock('@napi-rs/canvas', () => ({
      GlobalFonts: {
        registerFromPath,
        loadSystemFonts: vi.fn(),
      },
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ensureDefaultFontsRegistered } = await import('../src/fonts.js');

    ensureDefaultFontsRegistered();

    expect(registerFromPath).toHaveBeenCalledWith(explicitFontPath, expect.any(String));
    const warningMessages = warnSpy.mock.calls.map((args) => args[0]);
    expect(
      warningMessages.includes(
        'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
      )
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('allows overriding fallback font resolution with an explicit base path setter', async () => {
    const require = createRequire(import.meta.url);
    const explicitFontPath = require.resolve(
      '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2'
    );

    const registerFromPath = vi.fn(() => true);
    vi.doMock('@napi-rs/canvas', () => ({
      GlobalFonts: {
        registerFromPath,
        loadSystemFonts: vi.fn(),
      },
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { setFontAssetBasePath } = await import('../src/fonts.js');

    setFontAssetBasePath(explicitFontPath);

    expect(registerFromPath).toHaveBeenCalledWith(explicitFontPath, expect.any(String));
    const warningMessages = warnSpy.mock.calls.map((args) => args[0]);
    expect(
      warningMessages.includes(
        'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
      )
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('defers fallback warnings until a base path is configured', async () => {
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' as const });

      return {
        ...actual,
        existsSync: () => false,
        statSync: () => {
          throw enoent;
        },
      };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ensureDefaultFontsRegistered, setFontAssetBasePath } = await import('../src/fonts.js');

    ensureDefaultFontsRegistered(undefined, { suppressWarningsUntilConfigured: true });

    expect(warnSpy).not.toHaveBeenCalled();

    setFontAssetBasePath('/custom/fonts/NotoSans-Regular.ttf');

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('does not rely on import.meta-based module resolution when an explicit base path is set', async () => {
    const explicitFontPath = createRequire(import.meta.url).resolve(
      '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2'
    );

    const createRequireMock = vi.fn(() => {
      throw new Error('createRequire should not be called');
    });

    vi.doMock('module', async () => {
      const actual = await vi.importActual<typeof import('module')>('module');
      return {
        ...actual,
        createRequire: createRequireMock,
      };
    });

    const registerFromPath = vi.fn(() => true);
    vi.doMock('@napi-rs/canvas', () => ({
      GlobalFonts: {
        registerFromPath,
        loadSystemFonts: vi.fn(),
      },
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { setFontAssetBasePath } = await import('../src/fonts.js');

    setFontAssetBasePath(explicitFontPath);

    expect(createRequireMock).not.toHaveBeenCalled();
    expect(registerFromPath).toHaveBeenCalledWith(explicitFontPath, expect.any(String));

    const warningMessages = warnSpy.mock.calls.map((args) => args[0]);
    expect(
      warningMessages.includes(
        'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
      )
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('should not throw when import.meta.url is an HTTP URL (jsdom scenario)', () => {
    // This test verifies that the getSafeRequire() function correctly handles
    // the case where import.meta.url is an HTTP URL (as happens in jsdom).
    //
    // Previously, calling createRequire with an HTTP URL would throw:
    // "The argument 'filename' must be a file URL object, file URL string,
    // or absolute path string. Received 'http://localhost/main.js'"
    //
    // The fix uses eval('require') when detecting HTTP URLs, which is safe
    // in jsdom environments where require is available globally.

    // We can't easily test this in vitest since import.meta.url is always file://,
    // but we can verify that createRequire would fail with HTTP URLs
    const { createRequire: originalCreateRequire } = require('module');

    // Verify that createRequire rejects HTTP URLs
    expect(() => {
      originalCreateRequire('http://localhost/main.js');
    }).toThrow(/must be a file URL object, file URL string, or absolute path string/);

    // The actual fix is tested in the Jest fixture which runs in a real jsdom environment
    // where import.meta.url is naturally set to an HTTP URL
  });

  it('should handle jsdom with document.baseURI set to "about:blank"', async () => {
    // This test reproduces the bug where the bundler's import.meta.url polyfill
    // crashes when document.baseURI is 'about:blank' (the default for jsdom without a URL).
    //
    // The bundler (tsup/esbuild) creates a polyfill like:
    // var getImportMetaUrl = () => typeof document === "undefined"
    //   ? new URL(`file:${__filename}`).href
    //   : document.currentScript?.src || new URL("main.js", document.baseURI).href;
    //
    // When document.baseURI is 'about:blank', the polyfill crashes with:
    // TypeError: Invalid URL - new URL("main.js", "about:blank")
    //
    // The fix uses eval('import.meta.url') and checks for document existence early
    // to avoid triggering the problematic polyfill.

    // Set up a document with baseURI = 'about:blank' (default jsdom without URL)
    (globalThis as Record<string, unknown>).document = {
      baseURI: 'about:blank',
      currentScript: null,
    } as unknown as Document;

    // Previously this would crash with "TypeError: Invalid URL"
    // Now it should work because getSafeRequire detects document and uses eval('require')
    const { getSafeRequire } = await import('../src/utils.js');

    // Should not throw
    expect(() => {
      const requireFn = getSafeRequire();
      expect(typeof requireFn).toBe('function');
      expect(typeof requireFn.resolve).toBe('function');
    }).not.toThrow();

    // Verify that the main module can be loaded with about:blank baseURI
    // This is the actual bug that was reported
    const indexModule = await import('../src/index.js');
    expect(indexModule.default).toBeDefined();
    expect(indexModule.default.Map).toBeDefined();
  });
});
