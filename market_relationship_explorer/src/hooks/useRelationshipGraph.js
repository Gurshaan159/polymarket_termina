import { useMemo } from "react";
import { buildRelationshipGraph } from "../lib/relationshipEngine";

export function useRelationshipGraph({
  markets,
  selectedMarketId,
  movementSignals,
  movementSignalsVersion = 0,
  maxNeighbors = 12,
}) {
  return useMemo(
    () => buildRelationshipGraph(markets, selectedMarketId, movementSignals, maxNeighbors),
    [markets, selectedMarketId, movementSignals, movementSignalsVersion, maxNeighbors],
  );
}
