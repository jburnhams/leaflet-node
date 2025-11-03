import { existsSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { GlobalFonts } from '@napi-rs/canvas';

let fontsRegistered = false;
const registeredFonts = new Set<string>();

interface FontVariant {
  subset: string;
  style: 'normal' | 'italic';
  weight: number;
}

const FONT_VARIANTS: FontVariant[] = [
  { subset: 'latin', style: 'normal', weight: 400 },
  { subset: 'latin', style: 'italic', weight: 400 },
  { subset: 'latin-ext', style: 'normal', weight: 400 },
  { subset: 'latin-ext', style: 'italic', weight: 400 },
  { subset: 'cyrillic', style: 'normal', weight: 400 },
  { subset: 'cyrillic', style: 'italic', weight: 400 },
  { subset: 'cyrillic-ext', style: 'normal', weight: 400 },
  { subset: 'cyrillic-ext', style: 'italic', weight: 400 },
  { subset: 'greek', style: 'normal', weight: 400 },
  { subset: 'greek', style: 'italic', weight: 400 },
  { subset: 'greek-ext', style: 'normal', weight: 400 },
  { subset: 'greek-ext', style: 'italic', weight: 400 },
  { subset: 'devanagari', style: 'normal', weight: 400 },
  { subset: 'devanagari', style: 'italic', weight: 400 },
  { subset: 'vietnamese', style: 'normal', weight: 400 },
  { subset: 'vietnamese', style: 'italic', weight: 400 },
];

const FALLBACK_FAMILIES = ['LeafletNode Sans', 'Helvetica Neue', 'Helvetica', 'Arial'];
const FONT_SOURCE_MODULE = '@fontsource/noto-sans';
const FONT_BASE_PATH_ENV_KEY = 'LEAFLET_NODE_FONT_BASE_PATH';

let baseDirectoryWarningIssued = false;

function getConfiguredBasePath(explicitBasePath?: string): string | undefined {
  if (explicitBasePath) {
    return explicitBasePath;
  }

  if (typeof process !== 'undefined' && process.env?.[FONT_BASE_PATH_ENV_KEY]) {
    return process.env[FONT_BASE_PATH_ENV_KEY];
  }

  const globalConfig = globalThis as Record<string, unknown>;
  const globalBasePath = globalConfig[FONT_BASE_PATH_ENV_KEY];
  if (typeof globalBasePath === 'string') {
    return globalBasePath;
  }

  return undefined;
}

function warnAboutUnresolvableBaseDirectory(reason: unknown): void {
  if (baseDirectoryWarningIssued) {
    return;
  }

  baseDirectoryWarningIssued = true;
  console.warn(
    'leaflet-node: unable to determine package directory from import.meta.url; falling back to process.cwd().',
    reason
  );
}

function resolveBaseDirectory(explicitBasePath?: string): string {
  const configuredBasePath = getConfiguredBasePath(explicitBasePath);
  if (configuredBasePath) {
    return configuredBasePath;
  }

  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  try {
    if (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string') {
      const resolvedUrl = new URL(import.meta.url);
      if (resolvedUrl.protocol === 'file:') {
        return path.dirname(fileURLToPath(resolvedUrl));
      }

      warnAboutUnresolvableBaseDirectory(`Unexpected protocol: ${resolvedUrl.protocol}`);
    }
  } catch (error) {
    warnAboutUnresolvableBaseDirectory(error);
  }

  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }

  return '.';
}

function resolveFontsourceVariants(): string[] {
  try {
    const require = createRequire(import.meta.url);
    const resolvedPaths = new Set<string>();

    for (const variant of FONT_VARIANTS) {
      const fileStem = `noto-sans-${variant.subset}-${variant.weight}-${variant.style}`;
      const candidateFiles = [
        `${FONT_SOURCE_MODULE}/files/${fileStem}.woff2`,
        `${FONT_SOURCE_MODULE}/files/${fileStem}.woff`,
      ];

      for (const candidate of candidateFiles) {
        try {
          const fullPath = require.resolve(candidate);
          if (existsSync(fullPath)) {
            resolvedPaths.add(fullPath);
            break;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
            console.warn('leaflet-node: unable to resolve font asset path:', candidate, error);
          }
        }
      }
    }

    return Array.from(resolvedPaths);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
      console.warn('leaflet-node: unable to resolve font dependency path:', error);
    }
  }

  return [];
}

function resolveTypefaceFont(): string[] {
  try {
    const require = createRequire(import.meta.url);
    const moduleFontPath = require.resolve('typeface-noto-sans/files/noto-sans-latin-400.woff');

    if (existsSync(moduleFontPath)) {
      return [moduleFontPath];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
      console.warn('leaflet-node: unable to resolve font dependency path:', error);
    }
  }

  return [];
}

function resolveBundledFontPath(explicitBasePath?: string): string[] {
  const baseDir = resolveBaseDirectory(explicitBasePath);
  const filename = 'NotoSans-Regular.ttf';
  const directFontCandidate =
    explicitBasePath && path.extname(explicitBasePath).length > 0 ? explicitBasePath : null;
  const searchPaths = [
    directFontCandidate,
    explicitBasePath ? path.resolve(baseDir, filename) : null,
    path.resolve(baseDir, 'assets', 'fonts', filename),
    path.resolve(baseDir, '../assets', 'fonts', filename),
    path.resolve(baseDir, '../../assets', 'fonts', filename),
    path.resolve(process.cwd(), 'src', 'assets', 'fonts', filename),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of searchPaths) {
    if (existsSync(candidate)) {
      return [candidate];
    }
  }

  return [];
}

function resolveFontPaths(explicitBasePath?: string): string[] {
  const preferred = resolveFontsourceVariants();
  if (preferred.length > 0) {
    return preferred;
  }

  const legacy = resolveTypefaceFont();
  if (legacy.length > 0) {
    return legacy;
  }

  return resolveBundledFontPath(explicitBasePath);
}

function registerFontFamily(fontPath: string, family: string): void {
  const key = `${family}@@${fontPath}`;
  if (registeredFonts.has(key)) {
    return;
  }

  try {
    const registered = GlobalFonts.registerFromPath(fontPath, family);
    if (!registered) {
      console.warn(`leaflet-node: failed to register fallback font family "${family}"`);
      return;
    }

    registeredFonts.add(key);
  } catch (error) {
    console.warn(`leaflet-node: error registering fallback font family "${family}":`, error);
  }
}

export function ensureDefaultFontsRegistered(explicitBasePath?: string): void {
  if (fontsRegistered) {
    return;
  }

  fontsRegistered = true;

  const fontsApi = GlobalFonts as unknown as {
    loadSystemFonts?: () => void;
  };

  try {
    fontsApi.loadSystemFonts?.();
  } catch (error) {
    console.warn('leaflet-node: unable to load system fonts:', error);
  }

  const fontPaths = resolveFontPaths(explicitBasePath);
  if (fontPaths.length === 0) {
    console.warn(
      'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
    );
    return;
  }

  for (const fontPath of fontPaths) {
    for (const family of FALLBACK_FAMILIES) {
      registerFontFamily(fontPath, family);
    }
  }
}
