# Leaflet-node

[![npm version](https://img.shields.io/npm/v/leaflet-node.svg)](https://www.npmjs.com/package/leaflet-node)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

Leaflet-node brings the full Leaflet map API to Node.js so you can render maps without a browser.<br>
Reuse the same map setup for server-side image generation, automated tests, and CI pipelines.

## Installation

### Requirements

- Node.js >= 20
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
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

map.setSize(600, 400);
await new Promise((resolve) => setTimeout(resolve, 1000));
await map.saveImage('map.png');
```

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

## Proxy configuration

Leaflet-node honours standard proxy environment variables:

```bash
export HTTPS_PROXY=http://proxy.example.com:8080
export HTTP_PROXY=http://proxy.example.com:8080
```

Set them before running exports to route tile downloads through your proxy.

## Performance tips

- **Reuse map instances** – keep a single map around and update the view instead of creating a new `L.map()` for every render.
- **Batch exports** – kick off multiple independent exports with `Promise.all()` when your server has headroom.
- **Manage memory** – always call `map.remove()` and drop references once you are done with a map so Node.js can reclaim resources.

---

**Questions?** Open an issue on [GitHub](https://github.com/jburnhams/leaflet-node/issues).
