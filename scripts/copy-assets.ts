import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    })
  );
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..');
  const sourceDir = path.join(projectRoot, 'src', 'assets');
  const destinationDir = path.join(projectRoot, 'dist', 'assets');

  if (!existsSync(sourceDir)) {
    return;
  }

  await copyDirectory(sourceDir, destinationDir);
}

main().catch((error) => {
  console.error('Failed to copy asset files:', error);
  process.exitCode = 1;
});
