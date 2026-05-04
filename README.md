# green-pipe

[![npm version](https://img.shields.io/npm/v/green-pipe.svg)](https://www.npmjs.com/package/green-pipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Cloudinary](https://img.shields.io/badge/Built%20with-Cloudinary-3448C5?logo=cloudinary)](https://cloudinary.com)

CLI tool and GitHub Action that scans a repository for media assets, optimises them via Cloudinary, and generates a pull request with the results and a bandwidth/carbon report.

---

## Usage

```
scanning /path/to/docs...
found 23 assets (14.2MB)

optimising via Cloudinary...

  ✓ docs/hero.png        2.40 MB → 380 KB (84%)
  ✓ assets/logo.png      890 KB  → 120 KB (86%)
  → icons/check.svg      2% — below threshold, skipped

report → SUSTAINABILITY_REPORT.md
total  3.87MB saved (84.1%)
co2e   27.9g/year saved (~3.4 smartphone charges)
```

---

## Install

```bash
npm install -g green-pipe
```

```bash
# required
export CLOUDINARY_CLOUD_NAME=your-cloud-name
export CLOUDINARY_API_KEY=your-api-key
export CLOUDINARY_API_SECRET=your-api-secret

# optional — needed for --pr
export GITHUB_TOKEN=your-token
```

Or use a `.env` file — copy `.env.example` and fill in your values.

---

## CLI

```bash
# preview what would change without writing files
green-pipe scan --dry-run

# optimise assets in the current directory
green-pipe scan

# optimise a specific directory
green-pipe scan --dir ./docs

# optimise and open a GitHub PR
green-pipe scan --pr
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--dir <path>` | `.` | Directory to scan |
| `--pr` | `false` | Open a GitHub PR with the results |
| `--branch <name>` | `green-pipe/optimise-assets` | PR branch name |
| `--dry-run` | `false` | Report only, do not write files |
| `--threshold <n>` | `5` | Skip files with less than n% savings |
| `--cloud-folder <name>` | `green-pipe` | Cloudinary folder for uploads |
| `--report <path>` | `SUSTAINABILITY_REPORT.md` | Report output path |
| `--include <glob>` | `**/*.{png,jpg,jpeg,gif,webp,svg}` | Files to scan |
| `--exclude <dirs>` | `node_modules,dist,.git,vendor` | Directories to skip |
| `--max-size <mb>` | `50` | Skip files larger than this |
| `--monthly-views <n>` | `1000` | Assumed monthly views for carbon estimate |

---

## GitHub Action

```yaml
# .github/workflows/green-pipe.yml
name: Asset Optimisation
on:
  push:
    paths: ['**.png', '**.jpg', '**.jpeg', '**.gif', '**.webp', '**.svg']
  workflow_dispatch:

jobs:
  optimise:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: babortech/green-pipe@v1
        with:
          cloudinary_cloud_name: ${{ secrets.CLOUDINARY_CLOUD_NAME }}
          cloudinary_api_key: ${{ secrets.CLOUDINARY_API_KEY }}
          cloudinary_api_secret: ${{ secrets.CLOUDINARY_API_SECRET }}
          threshold: 10
          create_pr: true
```

Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

---

## How it works

1. **Scan** — recursively finds assets matching the include pattern, hashes each file for duplicate detection, skips anything above the size limit.

2. **Optimise** — uploads each asset to Cloudinary with `quality: auto` and `format: webp` for raster images. Files over 1 MB are capped at 2048px. Runs 5 uploads in parallel with exponential backoff on rate limits.

3. **Report** — writes a Markdown report with per-file before/after sizes, format conversions, carbon estimates, and any duplicates detected.

4. **PR** — creates a branch, commits the optimised files, and opens a pull request with the report as the body.

---

## Carbon estimates

Formula: `(bytes_saved / 1e9) × 0.6 × monthly_views × 12` = annual CO₂e in grams.

Based on 0.6g CO₂e per GB transferred ([The Shift Project](https://theshiftproject.org), IEA).
Reference values: 1 smartphone charge = 8.22g CO₂e, 1 km average car = 120g CO₂e.

These are estimates. Actual figures vary by CDN, geography, and caching.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDINARY_CLOUD_NAME` | yes | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | yes | Cloudinary API secret |
| `GITHUB_TOKEN` | for `--pr` | GitHub token for PR creation |

Credentials: [console.cloudinary.com](https://console.cloudinary.com)

---

## Contributing

```bash
git clone https://github.com/Princesso/green-pipe
cd green-pipe
npm install
cp .env.example .env
npm run dev -- scan --dry-run
```

---

## Licence

MIT
