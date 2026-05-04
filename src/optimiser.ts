import * as fs from 'fs';
import * as path from 'path';
import { v2 as cloudinary, UploadApiResponse, UploadApiOptions } from 'cloudinary';
import pLimit from 'p-limit';
import {
  AssetFile,
  GreenPipeConfig,
  OptimisationResult,
  OptimisedAsset,
  SkippedAsset,
  FailedAsset,
} from './types';
import { logger } from './logger';

const LARGE_IMAGE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB
const CONCURRENCY = 5;
const MAX_RETRIES = 3;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getTargetFormat(format: string): string | undefined {
  const raster = ['png', 'jpg', 'jpeg', 'webp'];
  if (raster.includes(format)) return 'webp';
  return undefined;
}

function buildEagerTransformation(file: AssetFile): UploadApiOptions {
  const targetFormat = getTargetFormat(file.format);
  const base: UploadApiOptions = { quality: 'auto' };

  if (targetFormat) {
    base.format = targetFormat;
  }

  if (file.size > LARGE_IMAGE_THRESHOLD_BYTES && file.format !== 'svg' && file.format !== 'gif') {
    base.width = 2048;
    base.crop = 'limit';
  }

  return base;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadWithRetry(
  filePath: string,
  options: UploadApiOptions,
  attempt = 1
): Promise<UploadApiResponse> {
  try {
    return await cloudinary.uploader.upload(filePath, options);
  } catch (err: unknown) {
    const error = err as { http_code?: number; message?: string };
    const isRateLimit = error?.http_code === 429;
    if (isRateLimit && attempt <= MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`  rate limited — retrying in ${delay / 1000}s (${attempt}/${MAX_RETRIES})`);
      await sleep(delay);
      return uploadWithRetry(filePath, options, attempt + 1);
    }
    throw err;
  }
}

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function optimiseAsset(
  file: AssetFile,
  config: GreenPipeConfig
): Promise<OptimisedAsset | SkippedAsset | FailedAsset> {
  const eagerTransformation = buildEagerTransformation(file);
  const targetFormat = getTargetFormat(file.format);

  try {
    const uploadResult = await uploadWithRetry(file.path, {
      folder: config.cloudFolder,
      eager: [eagerTransformation],
      eager_async: false,
      resource_type: 'image' as const,
    });

    const eager = uploadResult.eager?.[0];
    if (!eager) {
      throw new Error('no eager transformation result from Cloudinary');
    }

    const optimisedSize = eager.bytes;
    const savedBytes = file.size - optimisedSize;
    const savedPercent = (savedBytes / file.size) * 100;

    if (savedPercent < config.threshold) {
      const skipped: SkippedAsset = {
        file,
        reason: `${savedPercent.toFixed(1)}% savings below ${config.threshold}% threshold`,
      };
      logger.dim(`  → ${file.relativePath}  ${savedPercent.toFixed(1)}% — below threshold, skipped`);
      return skipped;
    }

    const optimisedUrl = eager.secure_url;

    let optimisedLocalPath = file.path;
    if (!config.dryRun) {
      const buffer = await downloadFile(optimisedUrl);

      if (targetFormat && targetFormat !== file.format) {
        const dir = path.dirname(file.path);
        const base = path.basename(file.path, path.extname(file.path));
        optimisedLocalPath = path.join(dir, `${base}.${targetFormat}`);
      }

      fs.writeFileSync(optimisedLocalPath, buffer);

      if (optimisedLocalPath !== file.path) {
        fs.unlinkSync(file.path);
      }
    }

    const formatConversion =
      targetFormat && targetFormat !== file.format
        ? `${file.format} → ${targetFormat}`
        : file.format;

    const result: OptimisedAsset = {
      original: file,
      optimisedSize,
      optimisedUrl,
      optimisedLocalPath,
      savedBytes,
      savedPercent,
      formatConversion,
    };

    logger.success(
      `  ✓ ${file.relativePath}  ${formatBytes(file.size)} → ${formatBytes(optimisedSize)} (${savedPercent.toFixed(0)}%)`
    );

    return result;
  } catch (err: unknown) {
    const error = err as Error;
    const failed: FailedAsset = { file, error: error.message ?? 'unknown error' };
    logger.error(`  ✗ ${file.relativePath}  ${error.message ?? 'upload error'}`);
    return failed;
  }
}

function isOptimised(result: OptimisedAsset | SkippedAsset | FailedAsset): result is OptimisedAsset {
  return 'optimisedSize' in result;
}

function isSkipped(result: OptimisedAsset | SkippedAsset | FailedAsset): result is SkippedAsset {
  return 'reason' in result;
}

export async function optimiseAssets(
  assets: AssetFile[],
  config: GreenPipeConfig
): Promise<OptimisationResult> {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
  });

  const limit = pLimit(CONCURRENCY);
  const tasks = assets.map((file) => limit(() => optimiseAsset(file, config)));
  const results = await Promise.all(tasks);

  const optimised: OptimisedAsset[] = [];
  const skipped: SkippedAsset[] = [];
  const failed: FailedAsset[] = [];

  for (const result of results) {
    if (isOptimised(result)) optimised.push(result);
    else if (isSkipped(result)) skipped.push(result);
    else failed.push(result as FailedAsset);
  }

  const totalSavedBytes = optimised.reduce((sum, r) => sum + r.savedBytes, 0);
  const totalOriginalBytes = optimised.reduce((sum, r) => sum + r.original.size, 0);
  const totalSavedPercent =
    totalOriginalBytes > 0 ? (totalSavedBytes / totalOriginalBytes) * 100 : 0;

  return { optimised, skipped, failed, totalSavedBytes, totalSavedPercent };
}
