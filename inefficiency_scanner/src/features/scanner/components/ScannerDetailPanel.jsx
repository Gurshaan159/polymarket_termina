import { SIGNAL_META, SIGNAL_TYPES } from "../types";
import { DivergenceChart } from "./DivergenceChart";
import { VolatilityChart } from "./VolatilityChart";
import { LiquidityContextCard } from "./LiquidityContextCard";
import { SignalBreakdownCard } from "./SignalBreakdownCard";
import styles from "../scanner.module.css";

export function ScannerDetailPanel({
  selectedResult,
  selectedMarket,
  marketById,
  relatedMarkets,
  micro,
}) {
  if (!selectedResult || !selectedMarket) {
    return (
      <section className={styles.detailPanel}>
        <div className={styles.emptyState}>Select a flagged result to inspect evidence.</div>
      </section>
    );
  }

  const meta = SIGNAL_META[selectedResult.signalType];
  const comparisonMarkets = selectedResult.comparisonMarketIds
    .map((id) => marketById.get(id))
    .filter(Boolean);

  const isVolatility = selectedResult.signalType === SIGNAL_TYPES.ABNORMAL_VOLATILITY;
  const usesDivergenceChart = !isVolatility;
  const resultClassLabel =
    selectedResult.resultClass === "actionable_signal"
      ? "actionable"
      : selectedResult.resultClass === "watchlist_signal"
        ? "watchlist"
        : "insufficient";

  return (
    <section className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <span className={`${styles.badge} ${styles[meta?.className || "badgeDefault"]}`}>{meta?.label}</span>
        <div className={styles.cardHeaderMeta}>
          <span className={`${styles.resultClassTag} ${styles[`resultClass${resultClassLabel[0].toUpperCase()}${resultClassLabel.slice(1)}`]}`}>
            {resultClassLabel}
          </span>
          <span className={styles.signalClassTag}>{selectedResult.signalClass}</span>
        </div>
      </div>
      <h2 className={styles.detailTitle}>{selectedMarket.question}</h2>
      <p className={styles.cardSubtitle}>{selectedMarket.eventTitle}</p>
      <div className={styles.evidenceTagRow}>
        <span className={styles.evidenceTag}>{selectedResult.evidenceQuality || "Low evidence"}</span>
      </div>
      <p className={styles.detailExplanation}>{selectedResult.explanation}</p>
      <p className={styles.detailSummary}>{selectedResult.behaviorSummary}</p>

      {comparisonMarkets.length ? (
        <div className={styles.detailCard}>
          <h4 className={styles.cardHeading}>Comparison Markets</h4>
          <ul className={styles.simpleList}>
            {comparisonMarkets.map((market) => (
              <li key={market.marketId}>{market.question}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {usesDivergenceChart ? (
        <DivergenceChart data={selectedResult.supportingChartData || []} />
      ) : (
        <VolatilityChart data={selectedResult.supportingChartData || []} />
      )}

      <SignalBreakdownCard result={selectedResult} />
      <LiquidityContextCard market={selectedMarket} micro={micro} result={selectedResult} />

      <div className={styles.detailCard}>
        <h4 className={styles.cardHeading}>Relationship Context</h4>
        {!relatedMarkets.length ? (
          <p className={styles.contextText}>No strong related markets were discovered for this contract.</p>
        ) : (
          <ul className={styles.simpleList}>
            {relatedMarkets.slice(0, 5).map((item) => (
              <li key={item.market.marketId}>
                {item.market.question} (relation score {(item.score * 100).toFixed(0)}%)
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
