import { resolve } from 'node:path';
import type { AnalysisProfile } from '@zugzwang/analysis';
import {
  AnalysisJobManager,
  type AnalysisRepository,
  type PositionAnalyzer,
} from './analysisJobManager.js';
import { FileAnalysisRepository } from './fileAnalysisRepository.js';
import { createStockfishPool } from './stockfishProcess.js';

export interface AnalysisRuntimeConfig {
  poolSize: number;
  totalHashMb: number;
  dataPath: string;
  depths: Record<AnalysisProfile, number>;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

export function parseAnalysisRuntimeConfig(
  environment: Record<string, string | undefined>,
  workingDirectory = process.cwd(),
): AnalysisRuntimeConfig {
  const fast = boundedInteger(environment.ANALYSIS_FAST_DEPTH, 18, 12, 24);
  const deep = boundedInteger(environment.ANALYSIS_DEEP_DEPTH, Math.max(22, fast), fast, 32);
  const maximum = boundedInteger(environment.ANALYSIS_MAXIMUM_DEPTH, Math.max(26, deep), deep, 40);
  return {
    poolSize: boundedInteger(environment.ANALYSIS_POOL_SIZE, 2, 1, 8),
    totalHashMb: boundedInteger(environment.ANALYSIS_HASH_MB, 512, 16, 4096),
    dataPath: environment.ANALYSIS_DATA_PATH ?? resolve(workingDirectory, '.data', 'analysis.json'),
    depths: { fast, deep, maximum },
  };
}

export async function createAnalysisRuntime(
  options: {
    config?: AnalysisRuntimeConfig;
    repository?: AnalysisRepository;
    createPool?: (options: {
      poolSize: number;
      totalHashMb: number;
    }) => Promise<PositionAnalyzer[]>;
  } = {},
): Promise<AnalysisJobManager> {
  const config = options.config ?? parseAnalysisRuntimeConfig(process.env);
  const repository = options.repository ?? new FileAnalysisRepository(config.dataPath);
  const createPool = options.createPool ?? createStockfishPool;
  const analyzers = await createPool({
    poolSize: config.poolSize,
    totalHashMb: config.totalHashMb,
  });
  const manager = new AnalysisJobManager({
    analyzers,
    repository,
    profileDepth: (profile) => config.depths[profile],
  });
  await manager.resume();
  return manager;
}
