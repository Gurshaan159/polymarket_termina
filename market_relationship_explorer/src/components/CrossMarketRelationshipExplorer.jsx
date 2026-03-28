import { useEffect, useMemo, useState } from "react";
import { useMarketsData } from "../hooks/useMarketsData";
import { useRelationshipGraph } from "../hooks/useRelationshipGraph";
import { ExplorerTopBar } from "./ExplorerTopBar";
import { MarketSearchPanel } from "./MarketSearchPanel";
import { MarketGraphView } from "./MarketGraphView";
import { MarketDetailsPanel } from "./MarketDetailsPanel";
import styles from "../styles/CrossMarketRelationshipExplorer.module.css";

export function CrossMarketRelationshipExplorer() {
  const {
    loading,
    error,
    eventsCount,
    markets,
    filteredMarkets,
    visibleCount,
    starterMarkets,
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
    movementSignals,
    movementSignalsVersion,
  } = useMarketsData();

  const graph = useRelationshipGraph({
    markets,
    selectedMarketId: selectedMarket?.marketId || selectedMarketId,
    movementSignals,
    movementSignalsVersion,
    maxNeighbors: 7,
  });

  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredSummary, setHoveredSummary] = useState(null);

  useEffect(() => {
    if (!selectedMarket) return;
    enrichMarket(selectedMarket);
    setSelectedEdge(null);
  }, [selectedMarket, enrichMarket]);

  useEffect(() => {
    if (!selectedMarket) return;
    const candidates = markets
      .filter((market) => {
        if (market.marketId === selectedMarket.marketId) return false;
        if (!market.tokenIds?.length) return false;
        if (market.eventId && market.eventId === selectedMarket.eventId) return true;
        if (market.sportOrLeague && market.sportOrLeague === selectedMarket.sportOrLeague) return true;
        return market.category === selectedMarket.category;
      })
      .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
      .slice(0, 18);

    for (const market of candidates) {
      enrichMarket(market);
    }
  }, [selectedMarket, markets, enrichMarket]);

  useEffect(() => {
    if (!graph?.edges?.length) return;
    const topTargets = graph.edges.slice(0, 5);
    for (const edge of topTargets) {
      const target = markets.find((market) => market.marketId === edge.targetMarketId);
      if (target) enrichMarket(target);
    }
  }, [graph, markets, enrichMarket]);

  const selectedRelationship = useMemo(() => {
    if (!graph.edges.length) return null;
    if (!selectedEdge) return graph.edges[0];
    return (
      graph.edges.find(
        (edge) =>
          edge.sourceMarketId === selectedEdge.sourceMarketId &&
          edge.targetMarketId === selectedEdge.targetMarketId,
      ) || graph.edges[0]
    );
  }, [selectedEdge, graph.edges]);

  const selectedRelatedMarket = useMemo(() => {
    if (!selectedRelationship) return null;
    return markets.find((market) => market.marketId === selectedRelationship.targetMarketId) || null;
  }, [selectedRelationship, markets]);

  const selectedRelationshipWithMarket = useMemo(() => {
    if (!selectedRelationship || !selectedRelatedMarket) return null;
    return {
      relationship: selectedRelationship,
      market: selectedRelatedMarket,
    };
  }, [selectedRelationship, selectedRelatedMarket]);

  useEffect(() => {
    if (!selectedRelatedMarket) return;
    enrichMarket(selectedRelatedMarket);
  }, [selectedRelatedMarket, enrichMarket]);

  const selectedRelationshipLegacy = useMemo(() => {
    if (!selectedEdge) return null;
    return graph.edges.find(
      (edge) =>
        edge.sourceMarketId === selectedEdge.sourceMarketId &&
        edge.targetMarketId === selectedEdge.targetMarketId,
    );
  }, [selectedEdge, graph.edges]);

  return (
    <div className={styles.container}>
      <ExplorerTopBar
        title="Cross-Market Relationship Explorer"
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
        marketsCount={visibleCount}
        eventsCount={eventsCount}
      />

      {error ? <div className={styles.noticeCard}>{error}</div> : null}

      <div className={styles.layout}>
        <aside className={styles.leftPanel}>
          <MarketSearchPanel
            markets={searchQuery ? filteredMarkets : starterMarkets}
            selectedMarketId={selectedMarket?.marketId || ""}
            onSelectMarket={(market) => {
              setSelectedMarketId(market.marketId);
              setSelectedEdge(null);
            }}
            heading={searchQuery ? "Search results" : "Starter markets (randomized each load)"}
          />
        </aside>

        <main className={styles.centerPanel}>
          {loading ? (
            <div className={styles.stateCard}>Loading markets from Gamma...</div>
          ) : !selectedMarket ? (
            <div className={styles.stateCard}>No markets found for current filters.</div>
          ) : (
            <MarketGraphView
              centerMarket={graph.center}
              nodes={graph.nodes}
              edges={graph.edges}
              onSelectNode={(market) => {
                setSelectedMarketId(market.marketId);
                setSelectedEdge(null);
              }}
              onSelectEdge={(edge) => setSelectedEdge(edge)}
              selectedEdge={selectedRelationshipLegacy || selectedRelationship}
              onHoverSummaryChange={setHoveredSummary}
            />
          )}

          {hoveredSummary ? (
            <div className={styles.hoverCard}>{hoveredSummary}</div>
          ) : null}
        </main>

        <aside className={styles.rightPanel}>
          <MarketDetailsPanel
            selectedMarket={selectedMarket}
            selectedRelationship={selectedRelationshipWithMarket}
            selectedMarketEnrichment={selectedMarket ? enrichmentByMarketId[selectedMarket.marketId] : null}
            relatedMarketEnrichment={
              selectedRelatedMarket ? enrichmentByMarketId[selectedRelatedMarket.marketId] : null
            }
          />
        </aside>
      </div>
    </div>
  );
}
