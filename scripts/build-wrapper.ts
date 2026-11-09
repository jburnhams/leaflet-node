#!/usr/bin/env tsx
/**
 * Build wrapper that filters out benign warnings
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Run tsdown
const tsdown = spawn('npx', ['tsdown'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

// Filter output to suppress benign warnings
const filterWarning = (data: Buffer) => {
  const text = data.toString();
  // Filter out the "named and default exports together" warning
  const filtered = text
    .split('\n')
    .filter((line) => !line.includes('named and default exports together'))
    .filter((line) => !line.includes('chunk.default'))
    .filter((line) => !line.includes('output.exports'))
    .join('\n');

  if (filtered.trim()) {
    return filtered;
  }
  return '';
};

tsdown.stdout.on('data', (data) => {
  const output = filterWarning(data);
  if (output) process.stdout.write(output);
});

tsdown.stderr.on('data', (data) => {
  const output = filterWarning(data);
  if (output) process.stderr.write(output);
});

tsdown.on('close', (code) => {
  if (code !== 0) {
    process.exit(code || 1);
  }

  // Run copy-assets script
  const copyAssets = spawn('npx', ['tsx', 'scripts/copy-assets.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  copyAssets.on('close', (assetsCode) => {
    process.exit(assetsCode || 0);
  });
});
