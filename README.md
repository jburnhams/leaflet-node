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

---

**Questions?** Open an issue on [GitHub](https://github.com/jburnhams/leaflet-node/issues).
