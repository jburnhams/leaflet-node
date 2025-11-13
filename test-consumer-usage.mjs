#!/usr/bin/env node
/**
 * Test how consumers would use leaflet-node vs actual Leaflet behavior
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('=== Consumer Usage Comparison ===\n');

console.log('Expected behavior (how Leaflet works):');
console.log('  const L = require("leaflet")');
console.log('  L.Map // ✓ works directly');
console.log('');

console.log('Current leaflet-node behavior:');
console.log('');

// How consumers use leaflet-node with CommonJS
console.log('1. leaflet-node with require() (CommonJS):');
const LeafletNodeCJS = require('./dist/index.js');
console.log('   - typeof result:', typeof LeafletNodeCJS);
console.log('   - Object.keys(result):', Object.keys(LeafletNodeCJS).slice(0, 5));
console.log('   - Has L.Map directly:', typeof LeafletNodeCJS.Map);
console.log('   - Has .default property:', typeof LeafletNodeCJS.default);
console.log('   - LeafletNodeCJS.default.Map:', typeof LeafletNodeCJS.default?.Map);
console.log('');

// How consumers use leaflet-node with ESM
console.log('2. leaflet-node with import (ESM):');
const LeafletNodeESM = await import('./dist/index.mjs');
console.log('   - typeof result:', typeof LeafletNodeESM);
console.log('   - Object.keys(result):', Object.keys(LeafletNodeESM));
console.log('   - Has .default:', typeof LeafletNodeESM.default);
console.log('   - LeafletNodeESM.default.Map:', typeof LeafletNodeESM.default?.Map);
console.log('');

console.log('=== THE PROBLEM ===');
console.log('To use Leaflet (CommonJS library):');
console.log('  const L = require("leaflet");');
console.log('  L.map(...) // works ✓');
console.log('');
console.log('To use leaflet-node (currently):');
console.log('  const L = require("leaflet-node");');
console.log('  L.map(...) // FAILS ✗ - L is { default: {...} }');
console.log('  L.default.map(...) // works ✓');
console.log('');
console.log('This inconsistency means users can\'t drop-in replace:');
console.log('  "leaflet" → "leaflet-node"');
