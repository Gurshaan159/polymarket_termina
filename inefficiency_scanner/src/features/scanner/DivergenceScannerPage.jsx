import { useEffect, useMemo, useState } from "react";
import { useScannerData } from "./hooks/useScannerData";
import { useScannerFilters } from "./hooks/useScannerFilters";
import { useSignalComputation } from "./hooks/useSignalComputation";
import { useRelatedMarkets } from "./hooks/useRelatedMarkets";
import { ScannerToolbar } from "./components/ScannerToolbar";
import { ScannerFilters } from "./components/ScannerFilters";
import { ScannerResultsList } from "./components/ScannerResultsList";
import { ScannerDetailPanel } from "./components/ScannerDetailPanel";
import styles from "./scanner.module.css";

export function DivergenceScannerPage() {
  const [horizon, setHorizon] = useState("24h");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const {
    markets,
    relationshipMap,
    marketTimeSeries,
    microByMarketId,
    categoryOptions,
    sportOptions,
    loading,
    error,
    lastUpdated,
  } = useScannerData({ horizon, refreshNonce });

  const results = useSignalComputation({
    markets,
    relationshipMap,
    marketTimeSeries,
    microByMarketId,
    horizon,
  });

  const { filters, setFilters, filteredResults, resetFilters } = useScannerFilters(results, markets);
  const [selectedResultId, setSelectedResultId] = useState("");

  useEffect(() => {
    if (!filteredResults.length) {
      setSelectedResultId("");
      return;
    }
    const hasSelected = filteredResults.some((result) => result.id === selectedResultId);
    if (!hasSelected) {
      setSelectedResultId(filteredResults[0].id);
    }
  }, [filteredResults, selectedResultId]);

  const selectedResult = useMemo(
    () => filteredResults.find((result) => result.id === selectedResultId) || null,
    [filteredResults, selectedResultId],
  );
  const marketById = useMemo(() => new Map(markets.map((market) => [market.marketId, market])), [markets]);
  const relationshipEdgeCount = useMemo(
    () => Array.from(relationshipMap.values()).reduce((sum, links) => sum + links.length, 0),
    [relationshipMap],
  );
  const diagnostics = useMemo(
    () => ({
      markets: markets.length,
      histories: marketTimeSeries.length,
      relationshipEdges: relationshipEdgeCount,
      rawSignals: results.length,
      filteredSignals: filteredResults.length,
    }),
    [markets.length, marketTimeSeries.length, relationshipEdgeCount, results.length, filteredResults.length],
  );
  const selectedMarket = selectedResult ? marketById.get(selectedResult.primaryMarketId) : null;
  const relatedMarkets = useRelatedMarkets(markets, relationshipMap, selectedMarket?.marketId);

  return (
    <div className={styles.page}>
      <ScannerToolbar
        horizon={horizon}
        onHorizonChange={setHorizon}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
        loading={loading}
        lastUpdated={lastUpdated}
        resultCount={filteredResults.length}
      />

      <ScannerFilters
        filters={filters}
        setFilters={setFilters}
        categoryOptions={categoryOptions}
        sportOptions={sportOptions}
        onReset={resetFilters}
      />

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.contentGrid}>
        <ScannerResultsList
          loading={loading}
          results={filteredResults}
          selectedResultId={selectedResultId}
          onSelectResult={setSelectedResultId}
          marketById={marketById}
          diagnostics={diagnostics}
        />
        <ScannerDetailPanel
          selectedResult={selectedResult}
          selectedMarket={selectedMarket}
          marketById={marketById}
          relatedMarkets={relatedMarkets}
          micro={selectedMarket ? microByMarketId.get(selectedMarket.marketId) : null}
        />
      </div>
    </div>
  );
}
