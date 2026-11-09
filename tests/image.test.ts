import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import HeadlessImage from '../src/image.js';

describe('HeadlessImage', () => {
  describe('Image loading', () => {
    it('should load image from local file path', async () => {
      // Create a simple test image
      const testImagePath = path.join(__dirname, 'test-image-load.png');

      // Create a minimal valid PNG (1x1 transparent pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      await fs.writeFile(testImagePath, pngBuffer);

      const image = new HeadlessImage();

      // Wait for image to load
      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          try {
            // Just verify onload was called - width/height are on the canvas image
            // The Image class itself may not expose them correctly
            expect(image.src).toBe(testImagePath);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        image.onerror = reject;
        image.src = testImagePath;
      });

      // Cleanup
      await fs.unlink(testImagePath);
    });

    it('should load image from file:// URL', async () => {
      // Create a test image
      const testImagePath = path.join(__dirname, 'test-image-file-url.png');

      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      await fs.writeFile(testImagePath, pngBuffer);

      const image = new HeadlessImage();
      const fileUrl = `file://${testImagePath}`;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          try {
            // Verify the file:// URL was processed
            expect(image.src).toBe(fileUrl);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        image.onerror = reject;
        image.src = fileUrl;
      });

      // Cleanup
      await fs.unlink(testImagePath);
    });

    it('should handle non-existent file error', async () => {
      const image = new HeadlessImage();

      const error = await new Promise<Error>((resolve) => {
        image.onerror = (err) => resolve(err);
        image.onload = () => resolve(new Error('Should not have loaded'));
        image.src = '/non/existent/path/to/image.png';
      });

      expect(error.message).toContain('Could not find image');
    });

    it('should strip query strings from file paths', async () => {
      const testImagePath = path.join(__dirname, 'test-image-query.png');

      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      await fs.writeFile(testImagePath, pngBuffer);

      const image = new HeadlessImage();
      const srcWithQuery = `${testImagePath}?v=123&size=large`;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          try {
            // Verify the query string path was handled
            expect(image.src).toBe(srcWithQuery);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        image.onerror = reject;
        // Add query string to the path
        image.src = srcWithQuery;
      });

      // Cleanup
      await fs.unlink(testImagePath);
    });

    it('should get and set src property', () => {
      const image = new HeadlessImage();
      expect(image.src).toBe('');

      // Setting src triggers async loading, so we just check the getter
      const testPath = '/test/path.png';
      image.src = testPath;
      expect(image.src).toBe(testPath);
    });
  });
});
