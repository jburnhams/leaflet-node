import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

export default defineConfig({
  entry: ['src/index.ts', 'src/testing.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['leaflet', 'canvas', 'jsdom'],
  shims: true,
  target: 'node18',
  silent: true, // Suppress post-build warnings about eval
  esbuildOptions(options) {
    // Suppress eval warnings - we use eval intentionally for Jest/jsdom compatibility
    // See src/utils.ts:getSafeRequire() for details on why eval is necessary
    options.logOverride = options.logOverride || {};
    options.logOverride['direct-eval'] = 'silent';
  },
  async onSuccess() {
    // Post-process CommonJS files to add interop code
    // This makes require('leaflet-node') behave like require('leaflet')
    const cjsFiles = globSync('dist/*.js', { ignore: '**/*.map' });

    for (const file of cjsFiles) {
      let contents = readFileSync(file, 'utf-8');

      // Add interop code after exports, before sourcemap comments
      const interopCode = `
// CommonJS interop: Copy all properties from exports.default to module.exports root
// This makes require('leaflet-node') behave like require('leaflet')
if (typeof module !== 'undefined' && module.exports && module.exports.default) {
  Object.assign(module.exports, module.exports.default);
}
`;

      const lines = contents.split('\n');
      const lastSourceMapIndex = lines.findIndex(l => l.includes('//# sourceMappingURL='));

      if (lastSourceMapIndex !== -1) {
        lines.splice(lastSourceMapIndex, 0, interopCode.trim());
      } else {
        lines.push(interopCode.trim());
      }

      contents = lines.join('\n');
      writeFileSync(file, contents);
    }

    console.log('✓ Added CommonJS interop code for Leaflet compatibility');
  },
});
