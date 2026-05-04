#!/usr/bin/env node
import { program } from 'commander';
import * as path from 'path';
import { loadConfig, validateCloudinaryConfig } from './config';
import { scanAssets } from './scanner';
import { optimiseAssets } from './optimiser';
import { estimateCarbon } from './carbon';
import { generateReport, saveReport } from './reporter';
import { createPR } from './git';
import { logger } from './logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function getRepoName(dir: string): string {
  return path.basename(path.resolve(dir));
}

program
  .name('green-pipe')
  .description('Scans a repository for media assets, optimises them via Cloudinary, and reports bandwidth and carbon savings.')
  .version(version);

program
  .command('scan')
  .description('Scan a directory for media assets and optimise them via Cloudinary')
  .option('--dir <path>', 'Directory to scan', '.')
  .option('--pr', 'Auto-create a GitHub PR with optimised assets', false)
  .option('--branch <name>', 'Branch name for the PR', 'green-pipe/optimise-assets')
  .option('--dry-run', 'Report only — do not replace files', false)
  .option('--threshold <number>', 'Minimum % savings to include a file', '5')
  .option('--cloud-folder <name>', 'Cloudinary upload folder', 'green-pipe')
  .option('--report <path>', 'Output path for the sustainability report', 'SUSTAINABILITY_REPORT.md')
  .option('--include <glob>', 'Glob pattern for files to scan', '**/*.{png,jpg,jpeg,gif,webp,svg}')
  .option('--exclude <dirs>', 'Comma-separated directories to exclude', 'node_modules,dist,.git,vendor')
  .option('--max-size <mb>', 'Max file size in MB to process', '50')
  .option('--monthly-views <number>', 'Estimated monthly page views for carbon calculations', '1000')
  .action(async (opts) => {
    const config = loadConfig({
      dir: opts.dir,
      pr: opts.pr,
      branch: opts.branch,
      dryRun: opts.dryRun,
      threshold: parseFloat(opts.threshold),
      cloudFolder: opts.cloudFolder,
      report: opts.report,
      include: opts.include,
      exclude: opts.exclude,
      maxSize: parseFloat(opts.maxSize),
      monthlyViews: parseFloat(opts.monthlyViews),
    });

    validateCloudinaryConfig(config);

    logger.info(`\nscanning ${config.dir}...`);
    if (config.dryRun) {
      logger.warn('  dry-run: files will not be modified\n');
    }

    const scanResult = await scanAssets(config);

    if (scanResult.totalCount === 0) {
      logger.info('no assets found');
      logger.dim(`  path:    ${config.dir}`);
      logger.dim(`  pattern: ${config.include}`);
      process.exit(0);
    }

    logger.info(`found ${scanResult.totalCount} assets (${formatMB(scanResult.totalSize)})`);

    if (scanResult.duplicates.length > 0) {
      logger.warn(`  ! ${scanResult.duplicates.length} duplicate group(s) detected`);
    }

    logger.info('\noptimising via Cloudinary...\n');

    const optimisationResult = await optimiseAssets(scanResult.assets, config);

    const carbon = estimateCarbon(optimisationResult.totalSavedBytes, config.monthlyViews);

    const repoName = getRepoName(config.dir);
    const reportContent = generateReport(scanResult, optimisationResult, carbon, config, repoName);

    const reportPath = path.resolve(config.report);
    saveReport(reportContent, reportPath);
    logger.success(`\nreport → ${config.report}`);

    if (optimisationResult.optimised.length === 0) {
      logger.info('all assets are at or below the savings threshold');
    } else {
      logger.success(
        `total  ${formatMB(optimisationResult.totalSavedBytes)} saved (${optimisationResult.totalSavedPercent.toFixed(1)}%)`
      );
      logger.success(
        `co2e   ${carbon.annualCO2Grams.toFixed(1)}g/year saved (~${carbon.smartphoneCharges.toFixed(1)} smartphone charges)`
      );
    }

    if (optimisationResult.failed.length > 0) {
      logger.warn(`\n  ! ${optimisationResult.failed.length} file(s) failed to process`);
    }

    if (config.pr && !config.dryRun) {
      logger.info('\ncreating pull request...');
      await createPR(optimisationResult, reportPath, reportContent, config);
    } else if (config.pr && config.dryRun) {
      logger.warn('  dry-run: skipping PR creation');
    }

    logger.info('');
  });

program.parse(process.argv);
