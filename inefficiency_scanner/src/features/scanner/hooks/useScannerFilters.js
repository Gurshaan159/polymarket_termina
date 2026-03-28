import { useMemo, useState } from "react";
import { SIGNAL_TYPES } from "../types";

function createDefaultFilters() {
  return {
    signalType: "all",
    category: "all",
    sport: "all",
    minSeverity: 0,
    minConfidence: 0,
    activeOnly: true,
    multiMarketOnly: false,
    thinOnly: false,
    showWatchlist: true,
    showInsufficient: false,
    search: "",
  };
}

export function useScannerFilters(results, markets) {
  const [filters, setFilters] = useState(createDefaultFilters);

  const marketById = useMemo(() => new Map(markets.map((market) => [market.marketId, market])), [markets]);

  const filteredResults = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return results.filter((result) => {
      if (filters.signalType !== "all" && result.signalType !== filters.signalType) return false;
      if (result.severityScore < filters.minSeverity) return false;
      if (result.confidenceScore < filters.minConfidence) return false;
      if (filters.multiMarketOnly && !result.comparisonMarketIds.length) return false;
      if (filters.thinOnly && result.signalType !== SIGNAL_TYPES.THIN_MARKET_INSTABILITY) return false;
      if (!filters.showWatchlist && result.resultClass === "watchlist_signal") return false;
      if (!filters.showInsufficient && result.resultClass === "insufficient_data") return false;

      const primary = marketById.get(result.primaryMarketId);
      if (!primary) return false;
      if (filters.activeOnly && (!primary.active || primary.closed)) return false;
      if (filters.category !== "all" && primary.category !== filters.category) return false;
      const sportValue = primary.sport || primary.league || "";
      if (filters.sport !== "all" && sportValue !== filters.sport) return false;

      if (query) {
        const haystack = [
          primary.question,
          primary.eventTitle,
          result.title,
          result.explanation,
          result.signalType,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [filters, marketById, results]);

  return {
    filters,
    setFilters,
    filteredResults,
    resetFilters: () => setFilters(createDefaultFilters()),
  };
}
