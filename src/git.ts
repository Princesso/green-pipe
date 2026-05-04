import { execSync } from 'child_process';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { GreenPipeConfig, OptimisationResult } from './types';
import { logger } from './logger';

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function getRepoInfo(cwd: string): { owner: string; repo: string } | null {
  try {
    const remoteUrl = exec('git remote get-url origin', cwd);
    // Handles both HTTPS and SSH formats
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/) ?? null;
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

async function ensureLabels(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<void> {
  const labelDefs = [
    { name: 'optimisation', color: '0075ca', description: 'Asset optimisation' },
    { name: 'sustainability', color: '2ea44f', description: 'Bandwidth and carbon reduction' },
  ];

  for (const label of labelDefs) {
    try {
      await octokit.issues.getLabel({ owner, repo, name: label.name });
    } catch {
      try {
        await octokit.issues.createLabel({ owner, repo, ...label });
      } catch {
        // non-fatal — labels are cosmetic
      }
    }
  }
}

export async function createPR(
  optimisationResult: OptimisationResult,
  reportPath: string,
  reportContent: string,
  config: GreenPipeConfig
): Promise<void> {
  if (!config.githubToken) {
    logger.warn('  ! GITHUB_TOKEN not set — skipping PR creation');
    return;
  }

  const cwd = config.dir;

  const repoInfo = getRepoInfo(cwd);
  if (!repoInfo) {
    logger.warn('  ! could not determine GitHub repo from git remote — skipping PR creation');
    return;
  }

  const { owner, repo } = repoInfo;
  const { totalSavedBytes, totalSavedPercent } = optimisationResult;

  try {
    exec(`git checkout -b ${config.branch}`, cwd);
  } catch {
    exec(`git checkout ${config.branch}`, cwd);
  }

  const optimisedPaths = optimisationResult.optimised.map((r) =>
    path.relative(cwd, r.optimisedLocalPath)
  );
  const deletedPaths = optimisationResult.optimised
    .filter((r) => r.optimisedLocalPath !== r.original.path)
    .map((r) => path.relative(cwd, r.original.path));

  const allPaths = [...optimisedPaths, ...deletedPaths, path.relative(cwd, reportPath)];

  try {
    exec(`git add ${allPaths.map((p) => `"${p}"`).join(' ')}`, cwd);
  } catch (err) {
    logger.warn(`  ! could not stage files individually: ${(err as Error).message}`);
    exec('git add -A', cwd);
  }

  const savedMB = formatMB(totalSavedBytes);
  const savedPct = totalSavedPercent.toFixed(1);
  const commitMsg = `chore: optimise media assets — ${savedMB} saved (${savedPct}% reduction)`;
  exec(`git commit -m "${commitMsg}"`, cwd);

  exec(`git push -u origin ${config.branch}`, cwd);

  const octokit = new Octokit({ auth: config.githubToken });

  await ensureLabels(octokit, owner, repo);

  let defaultBranch = 'main';
  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    defaultBranch = repoData.default_branch;
  } catch {
    // fallback to main
  }

  const prTitle = `green-pipe: optimise media assets — ${savedMB} saved`;

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: prTitle,
    body: reportContent,
    head: config.branch,
    base: defaultBranch,
  });

  try {
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: pr.number,
      labels: ['optimisation', 'sustainability'],
    });
  } catch {
    // non-fatal
  }

  logger.success(`  ✓ PR created: ${pr.html_url}`);
}
