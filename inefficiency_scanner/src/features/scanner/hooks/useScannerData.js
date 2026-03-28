import { useEffect, useState } from "react";
import {
  RESULT_CACHE_TTL_MS,
  UNIVERSE_CACHE_TTL_MS,
} from "../constants";
import { normalizeMarketUniverse } from "../pipeline/normalize";
import { buildRelationshipMap } from "../pipeline/relationships";
import { fetchActiveMarkets } from "../services/gammaApi";
import { fetchMarketBook, fetchMarketPriceHistory } from "../services/clobApi";
import { TIME_HORIZONS } from "../types";

let universeCache = {
  timestamp: 0,
  markets: [],
  categoryOptions: [],
  sportOptions: [],
};

const behaviorCacheByHorizon = new Map();
const HISTORY_CANDIDATE_LIMIT = 80;
const MICRO_CANDIDATE_LIMIT = 40;

function historyPriority(market) {
  const rank = market.scannerRankScore || 0;
  const p = market.primaryPrice;
  const informativePriceBoost =
    p === null ? 0 : p > 0.03 && p < 0.97 ? 1.2 : p > 0.01 && p < 0.99 ? 0.4 : -0.7;
  return rank + informativePriceBoost;
}

function isFresh(timestamp, ttlMs) {
  return Date.now() - timestamp < ttlMs;
}

async function runInBatches(items, batchSize, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await worker(item);
        } catch {
          return null;
        }
      }),
    );
    results.push(...batchResults);
  }
  return results.filter(Boolean);
}

async function loadUniverse() {
  if (isFresh(universeCache.timestamp, UNIVERSE_CACHE_TTL_MS) && universeCache.markets.length) {
    return universeCache;
  }
  const rawMarkets = await fetchActiveMarkets(700);
  const normalized = normalizeMarketUniverse(rawMarkets);
  universeCache = {
    timestamp: Date.now(),
    ...normalized,
  };
  return universeCache;
}

async function loadBehavior(markets, horizon, refreshNonce) {
  const cached = behaviorCacheByHorizon.get(horizon);
  const forceRefresh = (cached?.refreshNonce ?? -1) !== refreshNonce;
  if (!forceRefresh && cached && isFresh(cached.timestamp, RESULT_CACHE_TTL_MS)) {
    return cached.payload;
  }

  const interval = TIME_HORIZONS[horizon].interval;
  const candidates = markets
    .filter((market) => market.primaryTokenId)
    .slice()
    .sort((a, b) => historyPriority(b) - historyPriority(a))
    .slice(0, HISTORY_CANDIDATE_LIMIT);

  const [historyRows, microRows] = await Promise.all([
    runInBatches(candidates, 12, async (market) => {
      const history = await fetchMarketPriceHistory(market.primaryTokenId, interval);
      return {
        marketId: market.marketId,
        history,
      };
    }),
    runInBatches(candidates.slice(0, MICRO_CANDIDATE_LIMIT), 12, async (market) => {
      const book = await fetchMarketBook(market.primaryTokenId);
      return { marketId: market.marketId, book };
    }),
  ]);

  const microByMarketId = new Map(
    microRows.filter((row) => row.book).map((row) => [row.marketId, row.book]),
  );

  const payload = {
    marketTimeSeries: historyRows.filter((row) => Array.isArray(row.history) && row.history.length),
    microByMarketId,
    timestamp: Date.now(),
  };

  behaviorCacheByHorizon.set(horizon, {
    timestamp: Date.now(),
    refreshNonce,
    payload,
  });

  return payload;
}

export function useScannerData({ horizon, refreshNonce }) {
  const [state, setState] = useState({
    markets: [],
    relationshipMap: new Map(),
    marketTimeSeries: [],
    microByMarketId: new Map(),
    categoryOptions: [],
    sportOptions: [],
    loading: true,
    error: "",
    lastUpdated: null,
  });

  useEffect(() => {
    let disposed = false;

    async function run() {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const universe = await loadUniverse();
        const relationshipMap = buildRelationshipMap(universe.markets);
        const behavior = await loadBehavior(universe.markets, horizon, refreshNonce);

        if (disposed) return;
        setState({
          markets: universe.markets,
          relationshipMap,
          marketTimeSeries: behavior.marketTimeSeries,
          microByMarketId: behavior.microByMarketId,
          categoryOptions: universe.categoryOptions,
          sportOptions: universe.sportOptions,
          loading: false,
          error: "",
          lastUpdated: behavior.timestamp,
        });
      } catch (error) {
        if (disposed) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "Scanner data failed to load.",
        }));
      }
    }

    run();
    return () => {
      disposed = true;
    };
  }, [horizon, refreshNonce]);

  return state;
}
