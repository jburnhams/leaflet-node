import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const TILE_SIZE = 256;
const TILE_ROOT = path.join(__dirname, '..', 'fixtures', 'tiles');
const TILE_Z0_DIR = path.join(TILE_ROOT, '0', '0');
const TILE_FILE = path.join(TILE_Z0_DIR, '0.png');

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createTileBuffer(): Buffer {
  const png = new PNG({ width: TILE_SIZE, height: TILE_SIZE });

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const idx = (y * TILE_SIZE + x) * 4;
      png.data[idx] = (x * 5) % 256; // red gradient
      png.data[idx + 1] = (y * 5) % 256; // green gradient
      png.data[idx + 2] = (x + y) % 256; // blue gradient
      png.data[idx + 3] = 255; // opaque
    }
  }

  return PNG.sync.write(png);
}

export async function ensureTileFixture(): Promise<string> {
  await fs.mkdir(TILE_Z0_DIR, { recursive: true });

  if (!(await fileExists(TILE_FILE))) {
    const buffer = createTileBuffer();
    await fs.writeFile(TILE_FILE, buffer);
  }

  return TILE_FILE;
}

export async function ensureTileFixtureUrl(): Promise<string> {
  const filePath = await ensureTileFixture();
  return pathToFileURL(filePath).toString();
}

export function getTileFixturePath(): string {
  return TILE_FILE;
}

export function getTileFixtureUrl(): string {
  return pathToFileURL(TILE_FILE).toString();
}
