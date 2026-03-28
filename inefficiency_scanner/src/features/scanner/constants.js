export const MAX_MARKETS_TO_SCAN = 140;
export const UNIVERSE_CACHE_TTL_MS = 4 * 60 * 1000;
export const RESULT_CACHE_TTL_MS = 75 * 1000;
export const MIN_HISTORY_POINTS = 10;
export const MIN_RELATION_SCORE = 0.22;

export const SCANNER_GUARDRAILS = {
  dataSufficiency: {
    minDistinctTimestamps: 6,
    minCoverageRatio: 0.45,
    minWatchlistDistinctTimestamps: 4,
    minWatchlistCoverageRatio: 0.22,
    minAlignedPoints: 7,
    minAlignedCoverageRatio: 0.4,
    minWatchlistAlignedPoints: 4,
    minWatchlistAlignedCoverageRatio: 0.2,
    minAlignedMove: 0.02,
  },
  volatility: {
    epsilonStd: 0.0015,
    minRecentStd: 0.0032,
    minMeaningfulMove: 0.01,
    minActionableRatio: 1.45,
    minWatchlistRatio: 1.16,
  },
  divergence: {
    minActionableAbsGap: 0.025,
    minWatchlistAbsGap: 0.012,
    minMeanGap: 0.015,
    minPersistenceActionable: 0.58,
    minPersistenceWatchlist: 0.4,
    lowProbabilityFloor: 0.05,
    highProbabilityCeiling: 0.95,
    boundaryMeaningfulGap: 0.05,
  },
  movement: {
    minAbsoluteMove: 0.007,
    minMeaningfulSeriesMove: 0.012,
  },
  confidence: {
    thinLiquidityThreshold: 0.28,
    penaltySparseHistory: 20,
    penaltyLowVariance: 16,
    penaltyLowAlignedCoverage: 14,
    penaltyBoundary: 14,
    penaltyWeakRelationship: 18,
    penaltyThinLiquidity: 12,
    watchlistCap: 62,
    insufficientCap: 38,
  },
};
