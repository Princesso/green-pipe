import * as dotenv from 'dotenv';
import * as path from 'path';
import { GreenPipeConfig } from './types';
import { logger } from './logger';

dotenv.config();

export function loadConfig(cliOptions: Partial<GreenPipeConfig>): GreenPipeConfig {
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY ?? '';
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET ?? '';
  const githubToken = process.env.GITHUB_TOKEN;

  const excludeRaw = cliOptions.exclude as unknown;
  const exclude: string[] =
    typeof excludeRaw === 'string'
      ? excludeRaw.split(',').map((s) => s.trim())
      : Array.isArray(excludeRaw)
      ? excludeRaw
      : ['node_modules', 'dist', '.git', 'vendor'];

  return {
    dir: path.resolve(cliOptions.dir ?? '.'),
    pr: cliOptions.pr ?? false,
    branch: cliOptions.branch ?? 'green-pipe/optimise-assets',
    dryRun: cliOptions.dryRun ?? false,
    threshold: Number(cliOptions.threshold ?? 5),
    cloudFolder: cliOptions.cloudFolder ?? 'green-pipe',
    report: cliOptions.report ?? 'SUSTAINABILITY_REPORT.md',
    include: cliOptions.include ?? '**/*.{png,jpg,jpeg,gif,webp,svg}',
    exclude,
    maxSize: Number(cliOptions.maxSize ?? 50),
    monthlyViews: Number(cliOptions.monthlyViews ?? 1000),
    cloudinaryCloudName,
    cloudinaryApiKey,
    cloudinaryApiSecret,
    githubToken,
  };
}

export function validateCloudinaryConfig(config: GreenPipeConfig): void {
  const missing: string[] = [];
  if (!config.cloudinaryCloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!config.cloudinaryApiKey) missing.push('CLOUDINARY_API_KEY');
  if (!config.cloudinaryApiSecret) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length > 0) {
    logger.error('missing Cloudinary credentials:');
    missing.forEach((v) => logger.error(`  ${v}`));
    logger.error('');
    logger.error('set them in your environment or in a .env file:');
    logger.error('  CLOUDINARY_CLOUD_NAME=your-cloud-name');
    logger.error('  CLOUDINARY_API_KEY=your-api-key');
    logger.error('  CLOUDINARY_API_SECRET=your-api-secret');
    logger.error('');
    logger.error('https://console.cloudinary.com');
    process.exit(1);
  }
}
