# Leaflet-node

[![npm version](https://img.shields.io/npm/v/leaflet-node.svg)](https://www.npmjs.com/package/leaflet-node)
[![CI](https://github.com/jburnhams/leaflet-node/actions/workflows/node.js.yml/badge.svg)](https://github.com/jburnhams/leaflet-node/actions/workflows/node.js.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Leaflet-node brings the full Leaflet map API to Node.js so you can render maps without a browser.<br>
Reuse the same map setup for server-side image generation, automated tests, and CI pipelines.

## Installation

### Requirements

- Node.js 22.22+, 24.15+ or 26+ (the same range as [jsdom](https://github.com/jsdom/jsdom))
- Linux users need glibc >= 2.18 for the bundled [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas)
- Peer dependency: [`leaflet`](https://www.npmjs.com/package/leaflet) ^1.9.0

### Package managers

```bash
npm install leaflet-node leaflet
yarn add leaflet-node leaflet
pnpm add leaflet-node leaflet
bun add leaflet-node leaflet
```

## Quick example

```ts
import L from 'leaflet-node';

const container = document.createElement('div');
container.style.width = '600px';
container.style.height = '400px';

const map = L.map(container);
map.setView([51.505538, -0.090005], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

map.setSize(600, 400);
await new Promise((resolve) => setTimeout(resolve, 1000));
await map.saveImage('map.png');
```

## API

Importing `leaflet-node` sets up a jsdom window, a native canvas and Leaflet itself, then returns the
normal Leaflet namespace. Everything you know from Leaflet works as usual; leaflet-node adds:

| API                                              | What it does                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `map.setSize(width, height)`                     | Sets the map's pixel size (jsdom has no layout engine).                                                                                                                                    |
| `map.toBuffer(format?, quality?)`                | Renders the current view to a PNG or JPEG `Buffer`. `quality` (0 to 1) applies to JPEG only.                                                                                               |
| `map.saveImage(filename, { format?, quality? })` | Renders the view and writes it to disk. Resolves with the filename.                                                                                                                        |
| `initializeEnvironment(options)`                 | Changes the defaults for maps created afterwards: `mapSize` (default 1024×1024), `enableAnimations` (default `false`), `userAgent` (the jsdom `navigator.userAgent`), `fontAssetBasePath`. |
| `setFontAssetBasePath(path)`                     | Points the fallback font loader at a custom font file or directory.                                                                                                                        |

```ts
import L, { initializeEnvironment } from 'leaflet-node';

initializeEnvironment({ mapSize: { width: 512, height: 512 } });
const map = L.map(document.createElement('div')); // 512×512 unless you call setSize
```

`leaflet-node/testing` adds `createTestMap`, `cleanupTestMaps`, `waitForTiles` and `waitForMapReady`
(see [Tile loading helpers](#tile-loading-helpers)).

## Testing with Jest

Leaflet-node can run inside Jest with either the default `jsdom` environment for API-only tests or the `node` environment for full canvas rendering.

### API-only tests (no rendering)

Use the default environment and mock Leaflet to avoid creating a native canvas:

```ts
// tests/setup.ts
import { jest } from '@jest/globals';
const L = require('leaflet-node');

jest.doMock('leaflet', () => L);
```

### Rendering tests (with canvas output)

Switch to the `node` environment so leaflet-node can provide its own `jsdom` instance and native canvas bindings:

```ts
/**
 * @jest-environment node
 */
import L from 'leaflet-node';

test('render map', async () => {
  const container = document.createElement('div');
  const map = L.map(container);

  map.setView([51.505538, -0.090005], 13);
  map.setSize(512, 512);

  await map.saveImage('map.png');
});
```

### Known Issues

**Tile Loading Warnings:**

You may see warnings about "dynamic import callback" or "experimental-vm-modules" when running tests with tile layers in Jest. This is a Jest limitation with VM modules and doesn't affect the actual rendering—tiles that load successfully are rendered correctly.

To suppress these warnings, you can:

1. Run Jest with experimental VM modules support:
```bash
NODE_OPTIONS='--experimental-vm-modules' jest
```

2. Or, with ts-jest, enable isolated modules:
```js
// jest.config.js
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
```

> [!TIP]
> Need a ready-to-use map in tests? `leaflet-node/testing` exposes `createTestMap`, `cleanupTestMaps`, `waitForTiles`, and `waitForMapReady` helpers that work in both Vitest and Jest.

```ts
import { createTestMap, waitForMapReady } from 'leaflet-node/testing';

const map = createTestMap({ width: 400, height: 300 });
await waitForMapReady(map);
```

## Exporting images

Maps can be exported to disk or kept in-memory:

```ts
// Save to disk with optional encoder options
await map.saveImage('map.jpeg', { format: 'jpeg', quality: 0.85 });

// Get a Buffer for further processing
const pngBuffer = await map.toBuffer('png');
```

If you need full control of the canvas, use `map.toBuffer()` and write the result yourself:

```ts
import { promises as fs } from 'fs';

const buffer = await map.toBuffer('png');
await fs.writeFile('map.png', buffer);
```

## Tile loading helpers

Wait for tiles (with optional progress callbacks) before exporting:

```ts
import { waitForTiles } from 'leaflet-node/testing';

const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
layer.addTo(map);

await waitForTiles(layer, {
  timeout: 60_000,
  onProgress: ({ loaded, total }) => {
    console.log(`Loaded ${loaded}/${total} tiles`);
  },
});
```

Or wait for every tile layer on a map at once:

```ts
import { waitForMapReady } from 'leaflet-node/testing';

await waitForMapReady(map, {
  onTileProgress: (layer, progress) => {
    console.log(layer.getAttribution(), progress);
  },
});
```

📚 View the full documentation and live examples at [jburnhams.github.io/leaflet-node](https://jburnhams.github.io/leaflet-node/).

### Configuring fallback fonts

Leaflet-node automatically attempts to register the bundled Noto Sans fallback fonts. In
environments where `document.currentScript` is unavailable (for example, Node.js test
runners without a DOM shim), you can provide an explicit path to the font assets to
avoid warning messages:

```ts
process.env.LEAFLET_NODE_FONT_BASE_PATH = '/absolute/path/to/NotoSans-Regular.ttf';
const L = await import('leaflet-node');
```

Alternatively, you can set the base path programmatically after importing the
package:

```ts
import L, { setFontAssetBasePath } from 'leaflet-node';

setFontAssetBasePath('/absolute/path/to/NotoSans-Regular.ttf');
```

The base path can point directly to a font file or to a directory containing the
bundled `NotoSans-Regular.ttf` asset.

## Network requests

Tiles and remote images are fetched with [undici](https://github.com/nodejs/undici). Each request:

- sends `User-Agent: leaflet-node (+https://github.com/jburnhams/leaflet-node)`. Public tile servers
  such as OpenStreetMap's require an identifying User-Agent; check your provider's
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) before rendering at volume.
- times out after 30 seconds, which fires the image's `error` event (and Leaflet's `tileerror`).

### Proxy configuration

Leaflet-node honours the standard proxy environment variables:

```bash
export HTTP_PROXY=http://proxy.example.com:8080   # http:// URLs
export HTTPS_PROXY=http://proxy.example.com:8080  # https:// URLs (falls back to HTTP_PROXY)
export ALL_PROXY=http://proxy.example.com:8080    # used when neither of the above is set
export NO_PROXY=localhost,.internal.example.com   # hosts that bypass the proxy
```

Lower-case names work too. Changes are picked up on the next request.

## Performance tips

- **Reuse map instances** – keep a single map around and update the view instead of creating a new `L.map()` for every render.
- **Batch exports** – kick off multiple independent exports with `Promise.all()` when your server has headroom.
- **Manage memory** – always call `map.remove()` and drop references once you are done with a map so Node.js can reclaim resources.

## Development

```bash
npm ci
npm run lint          # Biome lint + format check, then oxlint's type-aware rules
npm run format        # Biome: apply formatting
npm run typecheck     # TypeScript 7
npm run test:coverage # builds with tsdown, then runs Vitest with coverage
npm run test:docs     # builds the docs site and checks the rendered examples
```

`tests/jest-fixture` runs the built package under `jest-environment-jsdom` to make sure it keeps
working inside consumers' Jest suites.

---

**Questions?** Open an issue on [GitHub](https://github.com/jburnhams/leaflet-node/issues).
