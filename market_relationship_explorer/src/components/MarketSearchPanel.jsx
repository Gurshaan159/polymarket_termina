import styles from "../styles/MarketSearchPanel.module.css";

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

export function MarketSearchPanel({ markets, selectedMarketId, onSelectMarket, heading }) {
  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <span>{heading}</span>
        <span className={styles.count}>{markets.length}</span>
      </div>
      <div className={styles.list}>
        {markets.length === 0 ? (
          <div className={styles.empty}>No markets match this filter/search.</div>
        ) : (
          markets.map((market) => {
            const topOutcome = market.outcomes?.[0];
            const isSelected = selectedMarketId === market.marketId;
            return (
              <button
                type="button"
                key={market.marketId}
                className={`${styles.item} ${isSelected ? styles.selected : ""}`}
                onClick={() => onSelectMarket(market)}
              >
                <div className={styles.itemTitle}>{market.marketTitle}</div>
                <div className={styles.eventTitle}>{market.eventTitle}</div>
                <div className={styles.metaRow}>
                  <span>{market.category || "uncategorized"}</span>
                  {market.sportOrLeague ? <span>{market.sportOrLeague}</span> : null}
                  {topOutcome ? <span>{topOutcome.outcome}: {formatPercent(topOutcome.price)}</span> : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
