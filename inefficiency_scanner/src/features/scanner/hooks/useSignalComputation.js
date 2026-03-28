import { useMemo } from "react";
import { computeScannerSignals } from "../pipeline/signals";

export function useSignalComputation({
  markets,
  relationshipMap,
  marketTimeSeries,
  microByMarketId,
  horizon,
}) {
  return useMemo(
    () =>
      computeScannerSignals({
        markets,
        relationshipMap,
        marketTimeSeries,
        microByMarketId,
        horizon,
      }),
    [markets, relationshipMap, marketTimeSeries, microByMarketId, horizon],
  );
}
