import { fetchActiveMarkets } from "../src/features/scanner/services/gammaApi.js";
import { fetchMarketBook, fetchMarketPriceHistory } from "../src/features/scanner/services/clobApi.js";
import { normalizeMarketUniverse } from "../src/features/scanner/pipeline/normalize.js";
import { buildRelationshipMap } from "../src/features/scanner/pipeline/relationships.js";
import { computeScannerSignals } from "../src/features/scanner/pipeline/signals.js";
import { TIME_HORIZONS } from "../src/features/scanner/types.js";

const HISTORY_CANDIDATE_LIMIT = 80;
const MICRO_CANDIDATE_LIMIT = 40;
const HORIZONS = ["1h", "6h", "24h", "7d"];

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const rawUrl = typeof input === "string" ? input : input.url;
  let url = rawUrl;
  if (rawUrl.startsWith("/api/gamma")) {
    url = `https://gamma-api.polymarket.com${rawUrl.replace(/^\/api\/gamma/, "")}`;
  } else if (rawUrl.startsWith("/api/clob")) {
    url = `https://clob.polymarket.com${rawUrl.replace(/^\/api\/clob/, "")}`;
  }
  const headers = new Headers(init.headers || {});
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Mozilla/5.0");
  }
  return originalFetch(url, { ...init, headers });
};

function historyPriority(market) {
  const rank = market.scannerRankScore || 0;
  const p = market.primaryPrice;
  const informativePriceBoost =
    p === null ? 0 : p > 0.03 && p < 0.97 ? 1.2 : p > 0.01 && p < 0.99 ? 0.4 : -0.7;
  return rank + informativePriceBoost;
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

function classCounts(signals) {
  return signals.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.resultClass === "actionable_signal") acc.actionable += 1;
      if (item.resultClass === "watchlist_signal") acc.watchlist += 1;
      if (item.resultClass === "insufficient_data") acc.insufficient += 1;
      return acc;
    },
    { total: 0, actionable: 0, watchlist: 0, insufficient: 0 },
  );
}

const rawMarkets = await fetchActiveMarkets(700);
const universe = normalizeMarketUniverse(rawMarkets);
const relationshipMap = buildRelationshipMap(universe.markets);
const edgeCount = Array.from(relationshipMap.values()).reduce((sum, links) => sum + links.length, 0);

console.log(
  JSON.stringify(
    {
      rawMarkets: rawMarkets.length,
      normalizedMarkets: universe.markets.length,
      relationshipEdges: edgeCount,
    },
    null,
    2,
  ),
);

for (const horizon of HORIZONS) {
  const interval = TIME_HORIZONS[horizon].interval;
  const candidates = universe.markets
    .filter((market) => market.primaryTokenId)
    .slice()
    .sort((a, b) => historyPriority(b) - historyPriority(a))
    .slice(0, HISTORY_CANDIDATE_LIMIT);

  const [historyRows, microRows] = await Promise.all([
    runInBatches(candidates, 12, async (market) => {
      const history = await fetchMarketPriceHistory(market.primaryTokenId, interval);
      return { marketId: market.marketId, history };
    }),
    runInBatches(candidates.slice(0, MICRO_CANDIDATE_LIMIT), 12, async (market) => {
      const book = await fetchMarketBook(market.primaryTokenId);
      return { marketId: market.marketId, book };
    }),
  ]);

  const marketTimeSeries = historyRows.filter((row) => Array.isArray(row.history) && row.history.length);
  const microByMarketId = new Map(microRows.filter((row) => row.book).map((row) => [row.marketId, row.book]));

  const signals = computeScannerSignals({
    markets: universe.markets,
    relationshipMap,
    marketTimeSeries,
    microByMarketId,
    horizon,
  });
  const counts = classCounts(signals);

  console.log(
    JSON.stringify(
      {
        horizon,
        candidates: candidates.length,
        historiesNonEmpty: marketTimeSeries.length,
        microNonEmpty: microByMarketId.size,
        ...counts,
      },
      null,
      2,
    ),
  );
}
