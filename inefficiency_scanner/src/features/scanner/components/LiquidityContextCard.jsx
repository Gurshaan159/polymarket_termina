import styles from "../scanner.module.css";

function valueText(value, fallback = "n/a") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toFixed(3);
}

export function LiquidityContextCard({ market, micro, result }) {
  return (
    <div className={styles.detailCard}>
      <h4 className={styles.cardHeading}>Liquidity / Reliability Context</h4>
      <div className={styles.detailGrid}>
        <div>
          <span className={styles.key}>Gamma liquidity</span>
          <strong>{market?.liquidity ? market.liquidity.toLocaleString() : "n/a"}</strong>
        </div>
        <div>
          <span className={styles.key}>Gamma volume</span>
          <strong>{market?.volume ? market.volume.toLocaleString() : "n/a"}</strong>
        </div>
        <div>
          <span className={styles.key}>Best bid</span>
          <strong>{valueText(micro?.bestBid)}</strong>
        </div>
        <div>
          <span className={styles.key}>Best ask</span>
          <strong>{valueText(micro?.bestAsk)}</strong>
        </div>
        <div>
          <span className={styles.key}>Spread</span>
          <strong>{valueText(micro?.spread)}</strong>
        </div>
        <div>
          <span className={styles.key}>Top-5 depth</span>
          <strong>{micro?.depth ? micro.depth.toFixed(2) : "n/a"}</strong>
        </div>
      </div>
      <p className={styles.contextText}>
        {result?.actionable
          ? "Signal scores as actionable under current severity and confidence thresholds."
          : "Treat with caution: confidence does not currently support a strong actionable read."}
      </p>
    </div>
  );
}
