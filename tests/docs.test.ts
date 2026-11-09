/**
 * Tests for documentation build process
 * Validates that docs are built correctly and all images are generated
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { analyzePng } from './helpers/png-analysis.js';
import { ensureTileFixture } from './helpers/tile-fixture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'docs-dist');
const imagesDir = path.join(distDir, 'images');

let tileFixtureUrl: string;

interface Example {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
}

describe('Documentation Build', () => {
  let examples: Example[];

  beforeAll(async () => {
    const fixtureFile = await ensureTileFixture();
    tileFixtureUrl = pathToFileURL(fixtureFile).toString();
    process.env.LEAFLET_NODE_TILE_URL = tileFixtureUrl;

    // Build the docs
    console.log('Building documentation...');
    execSync('npm run build:docs', {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        LEAFLET_NODE_TILE_URL: tileFixtureUrl,
      },
    });

    // Load examples
    const examplesPath = path.join(docsDir, 'examples.js');
    const examplesModule = await import(examplesPath);
    examples = examplesModule.examples;
  }, 120000); // 2 minute timeout for build

  describe('Directory Structure', () => {
    it('should create docs-dist directory', () => {
      expect(fs.existsSync(distDir)).toBe(true);
      expect(fs.statSync(distDir).isDirectory()).toBe(true);
    });

    it('should create images directory', () => {
      expect(fs.existsSync(imagesDir)).toBe(true);
      expect(fs.statSync(imagesDir).isDirectory()).toBe(true);
    });
  });

  describe('Source Files', () => {
    it('should copy index.html', () => {
      const indexPath = path.join(distDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('Leaflet-Node Examples');
      expect(content).toContain('examples-container');
    });

    it('should copy style.css', () => {
      const stylePath = path.join(distDir, 'style.css');
      expect(fs.existsSync(stylePath)).toBe(true);

      const content = fs.readFileSync(stylePath, 'utf-8');
      expect(content).toContain('.example');
      expect(content).toContain('.map-container');
    });

    it('should copy app.js', () => {
      const appPath = path.join(distDir, 'app.js');
      expect(fs.existsSync(appPath)).toBe(true);

      const content = fs.readFileSync(appPath, 'utf-8');
      expect(content).toContain('initializeExamples');
      expect(content).toContain('import { examples }');
    });

    it('should copy examples.js', () => {
      const examplesPath = path.join(distDir, 'examples.js');
      expect(fs.existsSync(examplesPath)).toBe(true);

      const content = fs.readFileSync(examplesPath, 'utf-8');
      expect(content).toContain('export const examples');
    });
  });

  describe('Generated Images', () => {
    it('should generate all example images', () => {
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        expect(fs.existsSync(imagePath), `Image for ${example.id} should exist`).toBe(true);
      });
    });

    it('should generate valid PNG files', () => {
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        const buffer = fs.readFileSync(imagePath);

        // Check PNG signature
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50); // 'P'
        expect(buffer[2]).toBe(0x4e); // 'N'
        expect(buffer[3]).toBe(0x47); // 'G'
      });
    });

    it('should generate non-empty images', () => {
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        const stats = fs.statSync(imagePath);

        // Images should be larger than 1KB (empty/broken images are usually very small)
        expect(
          stats.size,
          `Image for ${example.id} should be larger than 1KB, got ${stats.size} bytes`
        ).toBeGreaterThan(1024);
      });
    });

    it('should generate images with varied pixel data', () => {
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        const buffer = fs.readFileSync(imagePath);
        const analysis = analyzePng(buffer);

        expect(
          analysis.nonTransparentPixels,
          `Image for ${example.id} should contain map pixels`
        ).toBeGreaterThan(example.width * example.height * 0.1);

        expect(
          analysis.uniqueColorCount,
          `Image for ${example.id} should contain diverse colors`
        ).toBeGreaterThan(50);
      });
    });

    it('should generate images with correct dimensions', () => {
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        const buffer = fs.readFileSync(imagePath);
        const png = PNG.sync.read(buffer);

        expect(png.width, `Image width for ${example.id} should be ${example.width}`).toBe(
          example.width
        );

        expect(png.height, `Image height for ${example.id} should be ${example.height}`).toBe(
          example.height
        );
      });
    });

    it('should generate valid PNG data structures', () => {
      // This test validates that the PNG files are properly structured
      // even if tiles don't load in the headless environment
      examples.forEach((example) => {
        const imagePath = path.join(imagesDir, `${example.id}.png`);
        const buffer = fs.readFileSync(imagePath);

        // Parse the PNG - this will throw if the structure is invalid
        expect(() => {
          const png = PNG.sync.read(buffer);
          expect(png.data).toBeDefined();
          expect(png.data.length).toBe(example.width * example.height * 4);
        }).not.toThrow();
      });
    });
  });

  describe('Examples Configuration', () => {
    it('should have at least 5 examples', () => {
      expect(examples.length).toBeGreaterThanOrEqual(5);
    });

    it('should have unique example IDs', () => {
      const ids = examples.map((ex) => ex.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid example structure', () => {
      examples.forEach((example) => {
        expect(example.id, 'Example should have id').toBeDefined();
        expect(example.title, 'Example should have title').toBeDefined();
        expect(example.description, 'Example should have description').toBeDefined();
        expect(example.width, 'Example should have width').toBeGreaterThan(0);
        expect(example.height, 'Example should have height').toBeGreaterThan(0);
        expect(typeof example.id).toBe('string');
        expect(typeof example.title).toBe('string');
        expect(typeof example.description).toBe('string');
      });
    });
  });

  describe('Build Artifacts', () => {
    it('should have all required files in dist', () => {
      const requiredFiles = ['index.html', 'style.css', 'app.js', 'examples.js'];

      requiredFiles.forEach((file) => {
        const filePath = path.join(distDir, file);
        expect(fs.existsSync(filePath), `${file} should exist in docs-dist`).toBe(true);
      });
    });

    it('should have images directory with all examples', () => {
      const imageFiles = fs.readdirSync(imagesDir);
      expect(imageFiles.length).toBe(examples.length);

      examples.forEach((example) => {
        expect(imageFiles).toContain(`${example.id}.png`);
      });
    });
  });
});
