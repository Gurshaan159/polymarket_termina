import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeText, tokenize } from "../lib/textUtils";
import { normalizeMarketsFromEvents } from "../lib/marketNormalization";
import {
  deriveMovementSignal,
  fetchMarketBook,
  fetchMarketPriceHistory,
} from "../services/clobApi";
import { fetchGammaMarketUniverse } from "../services/gammaApi";

const STARTER_LIMIT = 24;
const STARTER_CANDIDATE_LIMIT = 180;

function rankStarterMarkets(markets) {
  return [...markets]
    .filter((market) => market.active && !market.closed)
    .sort((a, b) => {
      const scoreA = (a.liquidity || 0) * 0.7 + (a.volume || 0) * 0.3;
      const scoreB = (b.liquidity || 0) * 0.7 + (b.volume || 0) * 0.3;
      return scoreB - scoreA;
    });
}

function shuffleWithSeed(items, seed) {
  return [...items]
    .map((item) => ({ item, sortKey: Math.sin(seed + Number(item.marketId || 0)) }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((row) => row.item);
}

export function useMarketsData() {
  const [markets, setMarkets] = useState([]);
  const [eventsCount, setEventsCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [enrichmentByMarketId, setEnrichmentByMarketId] = useState({});
  const [movementSignalsVersion, setMovementSignalsVersion] = useState(0);
  const enrichmentLoadingRef = useRef(new Set());
  const enrichmentCacheRef = useRef({});
  const movementSignalsRef = useRef(new Map());
  const starterSeedRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const cacheRef = useRef({
    fetched: false,
    normalizedMarkets: [],
    starterMarkets: [],
  });

  useEffect(() => {
    let active = true;
    async function loadMarkets() {
      if (cacheRef.current.fetched) {
        setMarkets(cacheRef.current.normalizedMarkets);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const { events } = await fetchGammaMarketUniverse(300);
        const normalized = normalizeMarketsFromEvents(events);
        if (!normalized.length) {
          throw new Error("Gamma returned no active markets.");
        }
        const starter = rankStarterMarkets(normalized);
        cacheRef.current = {
          fetched: true,
          normalizedMarkets: normalized,
          starterMarkets: starter.slice(0, STARTER_LIMIT),
        };
        if (!active) return;
        setMarkets(normalized);
        setEventsCount(events.length);
      } catch (loadError) {
        if (!active) return;
        setMarkets([]);
        setEventsCount(0);
        setError(
          `Gamma API fetch failed: ${loadError?.message || "unknown error"}.`,
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    loadMarkets();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const values = new Set(markets.map((market) => market.category).filter(Boolean));
    return ["all", ...Array.from(values).sort()];
  }, [markets]);

  const baseFilteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      if (activeOnly && (!market.active || market.closed)) return false;
      if (selectedCategory !== "all" && market.category !== selectedCategory) return false;
      return true;
    });
  }, [markets, selectedCategory, activeOnly]);

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = normalizeText(searchQuery);
    const queryTokens = tokenize(normalizedQuery);
    if (!queryTokens.length) return baseFilteredMarkets;
    return baseFilteredMarkets.filter((market) =>
      queryTokens.every((token) => market.searchBlob.includes(token)),
    );
  }, [baseFilteredMarkets, searchQuery]);

  const starterMarkets = useMemo(() => {
    const candidates = rankStarterMarkets(baseFilteredMarkets).slice(0, STARTER_CANDIDATE_LIMIT);
    return shuffleWithSeed(candidates, starterSeedRef.current).slice(0, STARTER_LIMIT);
  }, [baseFilteredMarkets]);

  const selectedMarket = useMemo(() => {
    if (!filteredMarkets.length) return null;
    const directMatch = filteredMarkets.find((market) => market.marketId === selectedMarketId);
    if (directMatch) return directMatch;
    if (!searchQuery && starterMarkets.length) return starterMarkets[0];
    return filteredMarkets[0];
  }, [filteredMarkets, selectedMarketId, searchQuery, starterMarkets]);

  const visibleCount = searchQuery ? filteredMarkets.length : starterMarkets.length;

  useEffect(() => {
    if (selectedMarketId) return;
    if (starterMarkets.length) {
      setSelectedMarketId(starterMarkets[0].marketId);
    } else if (filteredMarkets.length) {
      setSelectedMarketId(filteredMarkets[0].marketId);
    }
  }, [selectedMarketId, starterMarkets, filteredMarkets]);

  const enrichMarket = useCallback(async (market) => {
    if (!market || !market.marketId) return;
    if (enrichmentCacheRef.current[market.marketId]) return;
    if (enrichmentLoadingRef.current.has(market.marketId)) return;
    const tokenId = market.tokenIds?.[0];
    if (!tokenId) return;

    enrichmentLoadingRef.current.add(market.marketId);
    try {
      const [book, history] = await Promise.all([
        fetchMarketBook(tokenId),
        fetchMarketPriceHistory(tokenId, "1d"),
      ]);
      const movementSignal = deriveMovementSignal(history);
      if (movementSignal) {
        const prev = movementSignalsRef.current.get(market.marketId);
        movementSignalsRef.current.set(market.marketId, movementSignal);
        if (!prev) {
          setMovementSignalsVersion((version) => version + 1);
        }
      }
      enrichmentCacheRef.current[market.marketId] = {
        tokenId,
        orderBook: book,
        history,
        movementSignal,
      };
      setEnrichmentByMarketId((prev) => ({
        ...prev,
        [market.marketId]: {
          tokenId,
          orderBook: book,
          history,
          movementSignal,
        },
      }));
    } finally {
      enrichmentLoadingRef.current.delete(market.marketId);
    }
  }, []);

  return {
    loading,
    error,
    eventsCount,
    markets,
    baseFilteredMarkets,
    starterMarkets,
    filteredMarkets,
    visibleCount,
    categories,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    activeOnly,
    setActiveOnly,
    selectedMarketId,
    setSelectedMarketId,
    selectedMarket,
    enrichmentByMarketId,
    enrichMarket,
    movementSignals: movementSignalsRef.current,
    movementSignalsVersion,
  };
}
