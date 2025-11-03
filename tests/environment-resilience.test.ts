import { afterEach, describe, expect, it, vi } from 'vitest';

describe('environment resilience', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('undici');
    vi.doUnmock('@napi-rs/canvas');
    delete (globalThis as Record<string, unknown>).document;
  });

  it('polyfills ReadableStream before lazily loading undici', async () => {
    const hadReadableStream = Object.prototype.hasOwnProperty.call(globalThis, 'ReadableStream');
    const originalDescriptor = hadReadableStream
      ? Object.getOwnPropertyDescriptor(globalThis, 'ReadableStream')
      : undefined;
    const originalValue = (globalThis as Record<string, unknown>).ReadableStream;

    try {
      if (hadReadableStream && originalDescriptor?.configurable) {
        Object.defineProperty(globalThis, 'ReadableStream', {
          configurable: true,
          enumerable: originalDescriptor.enumerable ?? false,
          writable: true,
          value: undefined,
        });
      } else if (hadReadableStream) {
        (globalThis as Record<string, unknown>).ReadableStream = undefined;
      } else {
        delete (globalThis as Record<string, unknown>).ReadableStream;
      }

      vi.resetModules();

      class MockCanvasImage {
        public width = 0;
        public height = 0;
        public onload?: () => void;
        public onerror?: (error: unknown) => void;

        set src(_value: unknown) {
          this.width = 1;
          this.height = 1;
          this.onload?.();
        }
      }

      vi.doMock('@napi-rs/canvas', () => ({
        Image: MockCanvasImage,
        GlobalFonts: {
          registerFromPath: () => true,
          loadSystemFonts: () => {},
        },
      }));

      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(0),
      }));

      vi.doMock('undici', () => {
        if (typeof globalThis.ReadableStream === 'undefined') {
          throw new Error('ReadableStream should be defined before importing undici');
        }

        return {
          fetch: fetchMock,
          ProxyAgent: vi.fn(function ProxyAgent() {}),
        };
      });

      const { loadImageSource } = await import('../src/image.js');

      await expect(loadImageSource('http://localhost/test.png')).resolves.toMatchObject({
        width: 1,
        height: 1,
      });

      expect(fetchMock).toHaveBeenCalled();
    } finally {
      if (hadReadableStream && originalDescriptor) {
        Object.defineProperty(globalThis, 'ReadableStream', originalDescriptor);
      } else if (hadReadableStream) {
        (globalThis as Record<string, unknown>).ReadableStream = originalValue;
      } else {
        delete (globalThis as Record<string, unknown>).ReadableStream;
      }
    }
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
});
