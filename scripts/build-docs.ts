#!/usr/bin/env node
/**
 * Build script for generating the docs website
 * This script:
 * 1. Generates PNG images for each example using leaflet-node
 * 2. Generates API documentation using TypeDoc
 * 3. Copies the docs source files to docs-dist
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import L from '../src/index.js';
import type { LeafletHeadlessMap } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'docs-dist');
const imagesDir = path.join(distDir, 'images');

interface Example {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  setup: (L: any, map: any) => void;
}

/**
 * Load examples from the docs/examples.js file
 */
async function loadExamples(): Promise<Example[]> {
  const examplesPath = path.join(docsDir, 'examples.js');
  const examplesModule = await import(examplesPath);
  return examplesModule.examples;
}

/**
 * Generate a PNG image for a single example using leaflet-node
 */
async function generateExampleImage(example: Example): Promise<void> {
  console.log(`Generating image for: ${example.title}`);

  // Create a map element
  const element = document.createElement('div');
  element.id = `map-${example.id}`;
  element.style.width = `${example.width}px`;
  element.style.height = `${example.height}px`;
  document.body.appendChild(element);

  try {
    // Create the map
    const map = L.map(element.id) as LeafletHeadlessMap;

    // Run the example setup first (this sets the view)
    example.setup(L, map);

    // Set the size after setup
    map.setSize(example.width, example.height);

    // Generate the filename
    const filename = path.join(imagesDir, `${example.id}.png`);

    // Wait a bit for tiles to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Save the image
    await map.saveImage(filename);

    console.log(`✓ Generated: ${example.id}.png`);

    // Clean up
    map.remove();
    document.body.removeChild(element);
  } catch (error) {
    console.error(`✗ Error generating ${example.id}:`, error);
    // Clean up on error
    if (document.body.contains(element)) {
      document.body.removeChild(element);
    }
  }
}

/**
 * Copy a directory recursively
 */
function copyDirectory(src: string, dest: string, exclude: string[] = []): void {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip excluded items
    if (exclude.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Generate API documentation using TypeDoc
 */
function generateApiDocs(): void {
  console.log('\n📚 Generating API documentation...');

  try {
    execSync('npx typedoc', {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log('✓ API documentation generated');
  } catch (error) {
    console.error('✗ Error generating API docs:', error);
    throw error;
  }
}

/**
 * Main build function
 */
async function build(): Promise<void> {
  console.log('🏗️  Building documentation site...\n');

  // Clean and create dist directory
  if (fs.existsSync(distDir)) {
    console.log('Cleaning dist directory...');
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  // Copy docs files to dist
  console.log('\n📁 Copying source files...');
  copyDirectory(docsDir, distDir, ['images']);
  console.log('✓ Source files copied');

  // Generate API documentation
  generateApiDocs();

  // Load examples
  console.log('\n📖 Loading examples...');
  const examples = await loadExamples();
  console.log(`✓ Loaded ${examples.length} examples`);

  // Generate images for each example
  console.log('\n🖼️  Generating images...');
  for (const example of examples) {
    await generateExampleImage(example);
  }

  console.log('\n✨ Build complete!');
  console.log(`📂 Output directory: ${distDir}`);
  console.log(`\n💡 To preview locally, run: npx serve docs-dist`);
}

// Run the build
build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
