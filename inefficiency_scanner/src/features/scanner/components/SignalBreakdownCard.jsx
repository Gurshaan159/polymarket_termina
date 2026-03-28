import styles from "../scanner.module.css";

const METRIC_ALLOWLIST = {
  field_probability_inconsistency: [
    "fieldSize",
    "latestFieldTotal",
    "meanFieldTotal",
    "persistenceRatio",
    "leaderMove",
    "medianPeerMove",
    "alignedCoverage",
    "relationshipTier",
    "liquidityQuality",
  ],
  delayed_reaction: [
    "relatedMove",
    "primaryMove",
    "primaryTotalMove",
    "latestGap",
    "alignedCoverage",
    "alignedPoints",
    "relationshipTier",
    "liquidityQuality",
  ],
  unsupported_jump: [
    "jumpSize",
    "relatedConfirmationMove",
    "alignedConfirmations",
    "historyCoverage",
    "liquidityQuality",
    "spreadEstimate",
  ],
  abnormal_volatility: [
    "volatilityRatio",
    "baselineStd",
    "recentStd",
    "totalMove",
    "historyCoverage",
    "liquidityQuality",
  ],
  thin_market_instability: [
    "totalMove",
    "spreadEstimate",
    "depthEstimate",
    "historyCoverage",
    "liquidityQuality",
  ],
};

function formatMetric(value) {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1.5) return value.toFixed(3);
    return value.toFixed(2);
  }
  return String(value);
}

export function SignalBreakdownCard({ result }) {
  if (!result) return null;
  const allowed = METRIC_ALLOWLIST[result.signalType] || [];
  const entries = Object.entries(result.metrics || {}).filter(([key]) => allowed.includes(key));
  return (
    <div className={styles.detailCard}>
      <h4 className={styles.cardHeading}>Signal Severity Drivers</h4>
      <div className={styles.severityRows}>
        <div className={styles.metricLine}>
          <span>Severity</span>
          <div className={styles.metricBarTrack}>
            <div className={styles.metricBarFill} style={{ width: `${result.severityScore}%` }} />
          </div>
          <strong>{result.severityScore}</strong>
        </div>
        <div className={styles.metricLine}>
          <span>Confidence</span>
          <div className={styles.metricBarTrack}>
            <div className={styles.metricBarFillConfidence} style={{ width: `${result.confidenceScore}%` }} />
          </div>
          <strong>{result.confidenceScore}</strong>
        </div>
      </div>
      <div className={styles.metricKeyValueList}>
        <div className={styles.keyValueRow}>
          <span>evidence_quality</span>
          <strong>{result.evidenceQuality || "Low evidence"}</strong>
        </div>
        <div className={styles.keyValueRow}>
          <span>result_class</span>
          <strong>{result.resultClass || "watchlist_signal"}</strong>
        </div>
        {entries.map(([key, value]) => (
          <div key={key} className={styles.keyValueRow}>
            <span>{key}</span>
            <strong>{formatMetric(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
