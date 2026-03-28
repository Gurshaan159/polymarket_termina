import { ScannerResultCard } from "./ScannerResultCard";
import styles from "../scanner.module.css";

export function ScannerResultsList({
  loading,
  results,
  selectedResultId,
  onSelectResult,
  marketById,
  diagnostics,
}) {
  const actionableCount = results.filter((item) => item.resultClass === "actionable_signal").length;
  const watchlistCount = results.filter((item) => item.resultClass === "watchlist_signal").length;
  const insufficientCount = results.filter((item) => item.resultClass === "insufficient_data").length;
  return (
    <section className={styles.resultsPanel}>
      <div className={styles.panelHeader}>
        <span>Actionable Opportunities</span>
        <span className={styles.resultsMetaCounts}>
          A {actionableCount} | W {watchlistCount} | I {insufficientCount}
        </span>
      </div>
      {loading ? <div className={styles.emptyState}>Scanning active markets...</div> : null}
      {!loading && !results.length ? (
        <div className={styles.emptyState}>
          <div>No signals matched the current filters.</div>
          <div className={styles.debugStats}>
            markets {diagnostics?.markets ?? 0} | histories {diagnostics?.histories ?? 0} | edges{" "}
            {diagnostics?.relationshipEdges ?? 0} | computed {diagnostics?.rawSignals ?? 0}
          </div>
        </div>
      ) : null}
      <div className={styles.resultsList}>
        {results.map((result) => (
          <ScannerResultCard
            key={result.id}
            result={result}
            primaryMarket={marketById.get(result.primaryMarketId)}
            selected={result.id === selectedResultId}
            onClick={() => onSelectResult(result.id)}
          />
        ))}
      </div>
    </section>
  );
}
