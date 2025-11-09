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
});
