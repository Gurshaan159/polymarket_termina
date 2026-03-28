import { MAX_MARKETS_TO_SCAN } from "../constants";

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTags(market) {
  const fromTags = arrayOrEmpty(market?.tags).map((tag) =>
    typeof tag === "string" ? tag : tag?.name || tag?.slug || "",
  );
  const fromTopic = typeof market?.topic === "string" ? [market.topic] : [];
  return [...new Set([...fromTags, ...fromTopic].filter(Boolean).map((tag) => tag.toLowerCase()))];
}

function parseTokenIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseOutcomeLabels(market) {
  const direct = arrayOrEmpty(market?.outcomes);
  if (direct.length) return direct.map((item) => String(item));
  if (typeof market?.outcomes === "string") {
    try {
      const parsed = JSON.parse(market.outcomes);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

function parseOutcomePrices(market) {
  const source = market?.outcomePrices ?? market?.outcome_prices ?? market?.prices;
  const direct = arrayOrEmpty(source).map(numberOrNull).filter((value) => value !== null);
  if (direct.length) return direct.map((price) => (price > 1 && price <= 100 ? price / 100 : price));
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        return parsed
          .map(numberOrNull)
          .filter((value) => value !== null)
          .map((price) => (price > 1 && price <= 100 ? price / 100 : price));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function pickPrimaryPrice(market, outcomePrices) {
  const directPrice = numberOrNull(market?.lastTradePrice ?? market?.lastPrice ?? market?.price);
  if (directPrice !== null) {
    if (directPrice > 1 && directPrice <= 100) return directPrice / 100;
    if (directPrice >= 0 && directPrice <= 1) return directPrice;
  }
  if (outcomePrices.length) return outcomePrices[0];
  return null;
}

function normalizeMarket(rawMarket) {
  const outcomePrices = parseOutcomePrices(rawMarket);
  const tokenIds = parseTokenIds(rawMarket?.clobTokenIds ?? rawMarket?.tokenIds);
  const eventFromNested = Array.isArray(rawMarket?.events) ? rawMarket.events[0] : null;
  const derivedEventId =
    rawMarket?.eventId ??
    rawMarket?.event_id ??
    eventFromNested?.id ??
    rawMarket?.seriesId ??
    "unknown";
  const derivedEventTitle =
    rawMarket?.eventTitle ??
    rawMarket?.event ??
    eventFromNested?.title ??
    rawMarket?.groupItemTitle ??
    "Unknown Event";
  const derivedCategory =
    rawMarket?.category ??
    rawMarket?.topic ??
    eventFromNested?.category ??
    eventFromNested?.slug ??
    "uncategorized";
  return {
    eventId: String(derivedEventId),
    eventTitle: derivedEventTitle,
    marketId: String(rawMarket?.id ?? rawMarket?.marketId ?? rawMarket?.conditionId ?? rawMarket?.slug ?? ""),
    question: rawMarket?.question ?? rawMarket?.title ?? rawMarket?.description ?? "Untitled market",
    slug: rawMarket?.slug ?? "",
    category: derivedCategory,
    tags: normalizeTags(rawMarket),
    sport: rawMarket?.sportsMarket?.sport ?? rawMarket?.sport ?? rawMarket?.league ?? "",
    league: rawMarket?.sportsMarket?.league ?? rawMarket?.league ?? "",
    outcomes: parseOutcomeLabels(rawMarket),
    outcomePrices,
    primaryPrice: pickPrimaryPrice(rawMarket, outcomePrices),
    active: rawMarket?.active ?? true,
    closed: rawMarket?.closed ?? false,
    tokenIds,
    primaryTokenId: tokenIds[0] || String(rawMarket?.clobTokenId ?? rawMarket?.tokenId ?? ""),
    liquidity: numberOrNull(rawMarket?.liquidity ?? rawMarket?.liquidityNum),
    volume: numberOrNull(rawMarket?.volume ?? rawMarket?.volumeNum ?? rawMarket?.volume24hr),
    volume24h: numberOrNull(rawMarket?.volume24hr ?? rawMarket?.volume24H ?? rawMarket?.volume24Hr),
    startTs: rawMarket?.startDate ?? rawMarket?.startTs ?? null,
    endTs: rawMarket?.endDate ?? rawMarket?.endTs ?? null,
    resolutionTs: rawMarket?.resolutionDate ?? rawMarket?.resolvedAt ?? null,
    raw: rawMarket,
  };
}

function daysToTs(ts) {
  if (!ts) return null;
  const value = new Date(ts).getTime();
  if (!Number.isFinite(value)) return null;
  return (value - Date.now()) / (24 * 60 * 60 * 1000);
}

function probabilityInformativeness(primaryPrice) {
  if (primaryPrice === null || primaryPrice === undefined) return 0.15;
  const clipped = Math.max(0, Math.min(1, primaryPrice));
  const centerDistance = Math.abs(clipped - 0.5) * 2;
  return Math.max(0, 1 - centerDistance);
}

function timeRelevanceScore(market) {
  const days = daysToTs(market.endTs || market.resolutionTs || market.startTs);
  if (days === null) return 0.2;
  if (days < 0) return -0.6;
  if (days <= 14) return 1;
  if (days <= 45) return 0.85;
  if (days <= 120) return 0.55;
  if (days <= 365) return 0.3;
  return 0.1;
}

function scoreMarket(market) {
  const liquidityScore = Math.log10((market.liquidity || 1) + 1);
  const volumeScore = Math.log10((market.volume24h || market.volume || 1) + 1);
  const longVolumeScore = Math.log10((market.volume || 1) + 1);
  const priceKnownBonus = market.primaryPrice !== null ? 1 : 0;
  const tokenBonus = market.primaryTokenId ? 1 : 0;
  const infoScore = probabilityInformativeness(market.primaryPrice);
  const timeScore = timeRelevanceScore(market);
  const boundaryPenalty =
    market.primaryPrice !== null && (market.primaryPrice <= 0.02 || market.primaryPrice >= 0.98)
      ? 1.2
      : 0;

  return (
    liquidityScore * 0.8 +
    volumeScore * 1.15 +
    longVolumeScore * 0.35 +
    infoScore * 2.2 +
    timeScore * 1.5 +
    priceKnownBonus +
    tokenBonus -
    boundaryPenalty
  );
}

export function normalizeMarketUniverse(rawMarkets = []) {
  const normalized = rawMarkets
    .map(normalizeMarket)
    .filter((market) => market.marketId && market.question)
    .filter((market) => market.active && !market.closed);

  const uniqueById = new Map();
  for (const market of normalized) {
    if (!uniqueById.has(market.marketId)) uniqueById.set(market.marketId, market);
  }

  const scored = Array.from(uniqueById.values()).map((market) => ({
    ...market,
    scannerRankScore: scoreMarket(market),
  }));

  const stronglyInformative = scored
    .filter((market) => {
      const p = market.primaryPrice;
      if (p === null) return false;
      if (p <= 0.03 || p >= 0.97) return false;
      const days = daysToTs(market.endTs || market.resolutionTs || market.startTs);
      return days !== null && days >= 0 && days <= 365;
    })
    .sort((a, b) => b.scannerRankScore - a.scannerRankScore);

  const broadTop = scored
    .slice()
    .sort((a, b) => b.scannerRankScore - a.scannerRankScore);

  const chosen = new Map();
  for (const market of stronglyInformative.slice(0, Math.floor(MAX_MARKETS_TO_SCAN * 0.55))) {
    chosen.set(market.marketId, market);
  }
  for (const market of broadTop) {
    if (chosen.size >= MAX_MARKETS_TO_SCAN) break;
    chosen.set(market.marketId, market);
  }

  const universe = Array.from(chosen.values()).sort((a, b) => b.scannerRankScore - a.scannerRankScore);

  const categoryOptions = [...new Set(universe.map((market) => market.category).filter(Boolean))].sort();
  const sportOptions = [...new Set(universe.map((market) => market.sport || market.league).filter(Boolean))].sort();

  return {
    markets: universe,
    categoryOptions,
    sportOptions,
  };
}
