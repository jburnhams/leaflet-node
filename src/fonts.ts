import { existsSync, statSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { GlobalFonts } from '@napi-rs/canvas';
import { getSafeRequire, getImportMetaUrlSafely } from './utils.js';

let fontsRegistered = false;
const registeredFonts = new Set<string>();
let lastExplicitBasePath: string | undefined;

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
let deferredBaseDirectoryWarning: unknown | null = null;

interface EnsureDefaultFontsOptions {
  suppressWarningsUntilConfigured?: boolean;
}

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

function recordBaseDirectoryResolutionFailure(reason: unknown): void {
  if (baseDirectoryWarningIssued) {
    return;
  }

  deferredBaseDirectoryWarning = reason;
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
    const importMetaUrl = getImportMetaUrlSafely();
    if (importMetaUrl) {
      const resolvedUrl = new URL(importMetaUrl);
      if (resolvedUrl.protocol === 'file:') {
        return path.dirname(fileURLToPath(resolvedUrl));
      }

      recordBaseDirectoryResolutionFailure(`Unexpected protocol: ${resolvedUrl.protocol}`);
    }
  } catch (error) {
    recordBaseDirectoryResolutionFailure(error);
  }

  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }

  return '.';
}

function resolveFontsourceVariants(): string[] {
  try {
    const require = getSafeRequire();
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
    const require = getSafeRequire();
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

function pathLooksLikeFile(candidate: string): boolean {
  try {
    const stats = statSync(candidate);
    if (stats.isFile()) {
      return true;
    }

    if (stats.isDirectory()) {
      return false;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('leaflet-node: unable to inspect font path candidate:', candidate, error);
    }
  }

  return path.extname(candidate).length > 0;
}

interface ResolveBundledFontPathOptions {
  skipModuleResolution?: boolean;
}

function resolveBundledFontPath(
  explicitBasePath?: string,
  options: ResolveBundledFontPathOptions = {}
): string[] {
  const configuredBasePath = getConfiguredBasePath(explicitBasePath);
  const baseDir = resolveBaseDirectory(explicitBasePath);
  const filename = 'NotoSans-Regular.ttf';
  const configuredPathIsFile = configuredBasePath ? pathLooksLikeFile(configuredBasePath) : false;
  const baseDirIsFile = pathLooksLikeFile(baseDir);
  const directFontCandidate = configuredPathIsFile ? configuredBasePath : null;
  const searchPaths = [
    directFontCandidate,
    !baseDirIsFile ? path.resolve(baseDir, filename) : null,
    !baseDirIsFile ? path.resolve(baseDir, 'assets', 'fonts', filename) : null,
    !baseDirIsFile ? path.resolve(baseDir, '../assets', 'fonts', filename) : null,
    !baseDirIsFile ? path.resolve(baseDir, '../../assets', 'fonts', filename) : null,
    path.resolve(process.cwd(), 'src', 'assets', 'fonts', filename),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of searchPaths) {
    if (existsSync(candidate)) {
      return [candidate];
    }
  }

  if (!options.skipModuleResolution) {
    const moduleResolved = resolveBundledFontPathViaModuleResolution(filename);
    if (moduleResolved.length > 0) {
      return moduleResolved;
    }
  }

  return [];
}

function resolveBundledFontPathViaModuleResolution(filename: string): string[] {
  let requireForResolution: ReturnType<typeof createRequire> | null = null;

  try {
    if (typeof __filename !== 'undefined') {
      requireForResolution = createRequire(__filename);
    }
  } catch {
    requireForResolution = null;
  }

  if (!requireForResolution) {
    try {
      const importMetaUrl = getImportMetaUrlSafely();
      if (importMetaUrl) {
        requireForResolution = getSafeRequire();
      }
    } catch {
      requireForResolution = null;
    }
  }

  if (!requireForResolution) {
    return [];
  }

  const resolutionCandidates = new Set<string>();
  const assetModuleId = `leaflet-node/assets/fonts/${filename}`;

  try {
    resolutionCandidates.add(requireForResolution.resolve(assetModuleId));
  } catch {
    // ignore resolution failure; fall back to other strategies
  }

  try {
    const packageJsonPath = requireForResolution.resolve('leaflet-node/package.json');
    resolutionCandidates.add(path.resolve(path.dirname(packageJsonPath), 'assets', 'fonts', filename));
  } catch {
    // ignore resolution failure; fall back to other strategies
  }

  for (const candidate of resolutionCandidates) {
    if (existsSync(candidate)) {
      return [candidate];
    }
  }

  return [];
}

function resolveFontPaths(explicitBasePath?: string): string[] {
  const configuredBasePath = getConfiguredBasePath(explicitBasePath);
  if (configuredBasePath) {
    return resolveBundledFontPath(explicitBasePath, { skipModuleResolution: true });
  }

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

export function ensureDefaultFontsRegistered(
  explicitBasePath?: string,
  options: EnsureDefaultFontsOptions = {}
): void {
  if (fontsRegistered && explicitBasePath === lastExplicitBasePath) {
    return;
  }

  lastExplicitBasePath = explicitBasePath;

  const fontsApi = GlobalFonts as unknown as {
    loadSystemFonts?: () => void;
  };

  try {
    fontsApi.loadSystemFonts?.();
  } catch (error) {
    console.warn('leaflet-node: unable to load system fonts:', error);
  }

  const configuredBasePath = getConfiguredBasePath(explicitBasePath);
  const fontPaths = resolveFontPaths(explicitBasePath);
  if (fontPaths.length === 0) {
    fontsRegistered = false;

    const shouldSuppressWarnings =
      options.suppressWarningsUntilConfigured && !configuredBasePath;

    if (!shouldSuppressWarnings) {
      if (!baseDirectoryWarningIssued && deferredBaseDirectoryWarning !== null) {
        baseDirectoryWarningIssued = true;
        console.warn(
          'leaflet-node: unable to determine package directory from import.meta.url; falling back to process.cwd().',
          deferredBaseDirectoryWarning
        );
      }

      console.warn(
        'leaflet-node: fallback font asset not found; install "@fontsource/noto-sans" or register a custom font.'
      );
    }

    return;
  }

  fontsRegistered = true;
  baseDirectoryWarningIssued = false;
  deferredBaseDirectoryWarning = null;

  for (const fontPath of fontPaths) {
    for (const family of FALLBACK_FAMILIES) {
      registerFontFamily(fontPath, family);
    }
  }
}

export function setFontAssetBasePath(basePath: string | null | undefined): void {
  const globalConfig = globalThis as Record<string, unknown>;

  if (typeof basePath === 'string' && basePath.length > 0) {
    globalConfig[FONT_BASE_PATH_ENV_KEY] = basePath;
  } else {
    delete globalConfig[FONT_BASE_PATH_ENV_KEY];
  }

  fontsRegistered = false;
  baseDirectoryWarningIssued = false;
  deferredBaseDirectoryWarning = null;

  ensureDefaultFontsRegistered(basePath ?? undefined);
}
