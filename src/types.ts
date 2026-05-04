export interface AssetFile {
  path: string;
  relativePath: string;
  size: number;
  format: string;
  hash: string;
}

export interface OptimisedAsset {
  original: AssetFile;
  optimisedSize: number;
  optimisedUrl: string;
  optimisedLocalPath: string;
  savedBytes: number;
  savedPercent: number;
  formatConversion: string;
}

export interface SkippedAsset {
  file: AssetFile;
  reason: string;
}

export interface FailedAsset {
  file: AssetFile;
  error: string;
}

export interface DuplicateGroup {
  hash: string;
  files: string[];
}

export interface ScanResult {
  assets: AssetFile[];
  duplicates: DuplicateGroup[];
  totalSize: number;
  totalCount: number;
}

export interface OptimisationResult {
  optimised: OptimisedAsset[];
  skipped: SkippedAsset[];
  failed: FailedAsset[];
  totalSavedBytes: number;
  totalSavedPercent: number;
}

export interface CarbonEstimate {
  annualCO2Grams: number;
  smartphoneCharges: number;
  drivingKm: number;
  monthlyViews: number;
  bytesSaved: number;
  monthlyBandwidthSavedMB: number;
}

export interface GreenPipeConfig {
  dir: string;
  pr: boolean;
  branch: string;
  dryRun: boolean;
  threshold: number;
  cloudFolder: string;
  report: string;
  include: string;
  exclude: string[];
  maxSize: number;
  monthlyViews: number;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  githubToken?: string;
}
