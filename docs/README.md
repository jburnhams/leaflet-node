# Leaflet-Node Documentation

This directory contains the source files for the leaflet-node examples website, which is published to GitHub Pages.

## Overview

The documentation website demonstrates leaflet-node by showing Leaflet.js examples side-by-side with server-generated PNG images. Each example uses the same configuration for both client-side rendering (interactive map) and server-side rendering (static image), proving that leaflet-node can generate identical output.

The site also includes comprehensive API documentation auto-generated from TSDoc comments in the source code using TypeDoc.

## Structure

- `index.html` - Main HTML page
- `style.css` - Stylesheet
- `app.js` - Client-side JavaScript that renders the live maps
- `examples.js` - Shared example configurations used by both client and server
- `README.md` - This file

After building, the `docs-dist/` directory contains:
- All source files from `docs/`
- `images/` - Generated PNG images for each example
- `api/` - Auto-generated API documentation from TypeDoc

## Building

To build the documentation site:

```bash
npm run build:docs
```

This will:
1. Build the leaflet-node library (`npm run build`)
2. Run the build script (`scripts/build-docs.ts`)
3. Copy all source files to `docs-dist/`
4. Generate API documentation using TypeDoc to `docs-dist/api/`
5. Generate PNG images for each example using leaflet-node to `docs-dist/images/`

> [!TIP]
> npm 10+ prints a deprecation warning when the legacy `npm_config_http_proxy`
> or `npm_config_https_proxy` variables are set. If your environment defines
> those values, prefix commands with `npm_config_http_proxy= npm_config_https_proxy=`
> (for example, `npm_config_http_proxy= npm_config_https_proxy= npm run build`)
> to silence the warning and future-proof your setup.

## Preview Locally

To preview the built site locally:

```bash
npm run preview:docs
```

Or manually:

```bash
npm run build:docs
npx serve docs-dist
```

Then open http://localhost:3000 in your browser.

## Adding Examples

To add a new example:

1. Add a new entry to the `examples` array in `examples.js`
2. Each example must have:
   - `id` - Unique identifier (used for filenames)
   - `title` - Display title
   - `description` - Brief description
   - `width` - Map width in pixels
   - `height` - Map height in pixels
   - `setup` - Function that sets up the map: `(L, map) => { ... }`

3. The `setup` function should:
   - Call `map.setView([lat, lng], zoom)` to set the initial view
   - Add tile layers, markers, and other Leaflet elements
   - This same function is used for both client-side and server-side rendering

4. Rebuild the docs to generate the new example image

Example:

```javascript
{
  id: 'my-example',
  title: 'My Example',
  description: 'Description of what this example demonstrates',
  width: 600,
  height: 400,
  setup: (L, map) => {
    const exampleSize = { width: 600, height: 400 };
    const londonLatLng = [51.505538, -0.090005];

    map.setView(londonLatLng, 13);

    if (typeof (map as any).setSize === 'function') {
      (map as any).setSize(exampleSize.width, exampleSize.height);
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker(londonLatLng).addTo(map).bindPopup('Example popup').openPopup();
  }
}
```

## GitHub Pages Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the `main` branch via the `.github/workflows/deploy-docs.yml` workflow.

The workflow:
1. Checks out the repository
2. Installs Node.js and system dependencies (Cairo, Pango, etc.)
3. Installs npm packages
4. Runs `npm run build:docs`
5. Deploys the `docs-dist` folder to GitHub Pages

## API Documentation

The API reference is auto-generated from TSDoc comments in the source code using TypeDoc.

### Generating API Docs Only

To generate just the API documentation without building the entire docs site:

```bash
npm run docs:api
```

This runs TypeDoc and outputs to `docs-dist/api/`. The configuration is in `typedoc.json`.

### Adding TSDoc Comments

TypeDoc reads JSDoc-style comments from the TypeScript source files. To add or update API documentation:

1. Add TSDoc comments to functions, interfaces, types, etc. in the `src/` directory
2. Use standard JSDoc tags like `@param`, `@returns`, `@example`, etc.
3. Run `npm run docs:api` to regenerate the documentation

Example:

```typescript
/**
 * Creates a new test map with common defaults
 * @param options - Configuration options for the test map
 * @returns A configured LeafletHeadlessMap instance
 * @example
 * ```typescript
 * import { createTestMap } from 'leaflet-node/testing';
 *
 * const map = createTestMap({
 *   width: 800,
 *   height: 600,
 *   zoom: 13
 * });
 * ```
 */
export function createTestMap(options: CreateTestMapOptions = {}): LeafletHeadlessMap {
  // ...
}
```

## Notes

- The `docs-dist` folder is generated and should not be committed to git
- Images are generated server-side during the build process
- The same `examples.js` configuration is used for both client and server rendering
- Examples use Leaflet 1.9.4 loaded from CDN for client-side rendering
- Server-side rendering uses the built leaflet-node library
- API documentation is auto-generated from TSDoc comments using TypeDoc
