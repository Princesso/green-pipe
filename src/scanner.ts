import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import { AssetFile, DuplicateGroup, ScanResult, GreenPipeConfig } from './types';
import { logger } from './logger';

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function bytesToMB(bytes: number): number {
  return bytes / 1024 / 1024;
}

export async function scanAssets(config: GreenPipeConfig): Promise<ScanResult> {
  const maxBytes = config.maxSize * 1024 * 1024;

  const ignorePatterns = config.exclude.map((dir) => `**/${dir}/**`);

  const files = await glob(config.include, {
    cwd: config.dir,
    ignore: ignorePatterns,
    absolute: false,
    nodir: true,
  });

  const assets: AssetFile[] = [];
  const hashMap = new Map<string, string[]>();

  for (const relativePath of files) {
    const absolutePath = path.join(config.dir, relativePath);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      logger.warn(`  ! could not stat ${relativePath}, skipping`);
      continue;
    }

    if (stat.size > maxBytes) {
      logger.dim(`  → ${relativePath}  ${bytesToMB(stat.size).toFixed(1)}MB exceeds ${config.maxSize}MB limit, skipped`);
      continue;
    }

    let hash: string;
    try {
      hash = hashFile(absolutePath);
    } catch {
      logger.warn(`  ! could not hash ${relativePath}, skipping`);
      continue;
    }

    const ext = path.extname(relativePath).replace('.', '').toLowerCase();

    assets.push({
      path: absolutePath,
      relativePath,
      size: stat.size,
      format: ext,
      hash,
    });

    const existing = hashMap.get(hash) ?? [];
    existing.push(relativePath);
    hashMap.set(hash, existing);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [hash, paths] of hashMap.entries()) {
    if (paths.length > 1) {
      duplicates.push({ hash, files: paths });
    }
  }

  const totalSize = assets.reduce((sum, a) => sum + a.size, 0);

  return {
    assets,
    duplicates,
    totalSize,
    totalCount: assets.length,
  };
}
