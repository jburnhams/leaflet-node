#!/usr/bin/env node
/**
 * Test script to verify how Leaflet exports work with both require() and import
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('=== Testing Leaflet Import Behaviors ===\n');

// First, we need to set up a DOM environment for Leaflet
// Let's import leaflet-node which sets up the environment
console.log('Setting up headless environment via leaflet-node...\n');
const leafletNodeModule = await import('./dist/index.mjs');
const LFromLeafletNode = leafletNodeModule.default;

console.log('0. Leaflet-node default export:');
console.log('   - Has L.Map:', typeof LFromLeafletNode.Map);
console.log('   - Has L.Marker:', typeof LFromLeafletNode.Marker);
console.log('   - L.Map.prototype.initialize exists:', typeof LFromLeafletNode.Map?.prototype?.initialize);
console.log('');

// Now that the DOM is set up, we can safely require leaflet
// Test 1: Using require() (CommonJS style)
console.log('1. Using require("leaflet"):');
const LViaRequire = require('leaflet');
console.log('   - Has L.Map:', typeof LViaRequire.Map);
console.log('   - Has L.Marker:', typeof LViaRequire.Marker);
console.log('   - Has L.default:', typeof LViaRequire.default);
console.log('   - L.Map.prototype exists:', !!LViaRequire.Map?.prototype);
console.log('   - L.Map.prototype.initialize exists:', typeof LViaRequire.Map?.prototype?.initialize);
console.log('');

// Test 2: Using import (ESM style)
console.log('2. Using import L from "leaflet":');
const { default: LViaImportDefault } = await import('leaflet');
console.log('   - Has L.Map:', typeof LViaImportDefault.Map);
console.log('   - Has L.Marker:', typeof LViaImportDefault.Marker);
console.log('   - Has L.default:', typeof LViaImportDefault.default);
console.log('   - L.Map.prototype exists:', !!LViaImportDefault.Map?.prototype);
console.log('   - L.Map.prototype.initialize exists:', typeof LViaImportDefault.Map?.prototype?.initialize);
console.log('');

// Test 3: Compare them
console.log('3. Comparison:');
console.log('   - Are they the same object?', LViaRequire === LViaImportDefault);
console.log('   - Map class is the same?', LViaRequire.Map === LViaImportDefault.Map);
console.log('');

// Test 4: What leaflet-node sees in initializeEnvironment()
console.log('4. What leaflet-node index.ts sees on line 250:');
console.log('   - const L = requireFn(leafletPath) returns:', typeof LViaRequire);
console.log('   - Can access L.Map directly:', typeof LViaRequire.Map);
console.log('   - Can access L.Map.prototype:', !!LViaRequire.Map?.prototype);
console.log('   - patchMapPrototype(L) would receive valid L.Map:', !!LViaRequire.Map?.prototype);
console.log('');

console.log('=== Conclusion ===');
console.log('Leaflet uses CommonJS/UMD exports, so:');
console.log('- require("leaflet") returns the Leaflet object directly');
console.log('- import L from "leaflet" gets the same object (synthetic default)');
console.log('- Both have L.Map, L.Marker, etc. directly accessible');
console.log('- There is NO .default wrapper that needs unwrapping');
