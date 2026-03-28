import { useMemo } from "react";

export function useRelatedMarkets(markets, relationshipMap, marketId) {
  return useMemo(() => {
    if (!marketId) return [];
    const marketById = new Map(markets.map((market) => [market.marketId, market]));
    const links = relationshipMap.get(marketId) || [];
    return links
      .map((link) => {
        const market = marketById.get(link.marketId);
        if (!market) return null;
        return { market, score: link.score, reasons: link.reasons };
      })
      .filter(Boolean);
  }, [markets, relationshipMap, marketId]);
}
