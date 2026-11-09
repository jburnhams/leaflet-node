import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsdown';

/**
 * CommonJS interop: copy every property of exports.default onto module.exports
 * so `require('leaflet-node')` behaves exactly like `require('leaflet')`.
 */
const CJS_INTEROP = `
// CommonJS interop: make require('leaflet-node') behave like require('leaflet')
if (typeof module !== 'undefined' && module.exports && module.exports.default) {
  Object.assign(module.exports, module.exports.default);
}
`.trim();

const ENTRY_NAMES = ['index', 'testing'];

function addCommonJsInterop(): void {
  for (const name of ENTRY_NAMES) {
    const file = join('dist', `${name}.js`);
    const lines = readFileSync(file, 'utf-8').split('\n');
    const sourceMapIndex = lines.findIndex((line) => line.startsWith('//# sourceMappingURL='));
    lines.splice(sourceMapIndex === -1 ? lines.length : sourceMapIndex, 0, CJS_INTEROP);
    writeFileSync(file, lines.join('\n'));
  }
}

export default defineConfig({
  entry: ENTRY_NAMES.map((name) => `src/${name}.ts`),
  format: ['cjs', 'esm'],
  platform: 'node',
  target: 'node22',
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  // Keep tsup's file names (index.js for CJS, index.mjs for ESM) so the
  // package.json entry points stay the same for consumers.
  fixedExtension: false,
  inputOptions: {
    // utils.ts uses eval('require') deliberately so bundlers can't replace it
    // with an import.meta.url shim that breaks under jsdom (see getSafeRequire).
    checks: { eval: false },
  },
  onSuccess: addCommonJsInterop,
});
