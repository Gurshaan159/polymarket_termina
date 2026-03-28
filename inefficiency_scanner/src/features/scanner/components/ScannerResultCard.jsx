import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SIGNAL_META } from "../types";
import styles from "../scanner.module.css";

function SeverityBar({ value, className }) {
  return (
    <div className={styles.metricLine}>
      <span>{className}</span>
      <div className={styles.metricBarTrack}>
        <div className={styles.metricBarFill} style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export function ScannerResultCard({ result, primaryMarket, selected, onClick }) {
  const badgeMeta = SIGNAL_META[result.signalType];
  const sparklineData = (result.supportingChartData || []).slice(-18);
  const resultClassLabel =
    result.resultClass === "actionable_signal"
      ? "actionable"
      : result.resultClass === "watchlist_signal"
        ? "watchlist"
        : "insufficient";
  return (
    <button
      type="button"
      className={`${styles.resultCard} ${styles[`resultCard${resultClassLabel[0].toUpperCase()}${resultClassLabel.slice(1)}`]} ${selected ? styles.resultCardSelected : ""}`}
      onClick={onClick}
    >
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${styles[badgeMeta?.className || "badgeDefault"]}`}>
          {badgeMeta?.label || result.signalType}
        </span>
        <div className={styles.cardHeaderMeta}>
          <span className={`${styles.resultClassTag} ${styles[`resultClass${resultClassLabel[0].toUpperCase()}${resultClassLabel.slice(1)}`]}`}>
            {resultClassLabel}
          </span>
          <span className={styles.signalClassTag}>{result.signalClass}</span>
        </div>
      </div>

      <h3 className={styles.cardTitle}>{primaryMarket?.question || result.title}</h3>
      <p className={styles.cardSubtitle}>{primaryMarket?.eventTitle || "Unknown event"}</p>

      <div className={styles.meterStack}>
        <SeverityBar value={result.severityScore} className="Severity" />
        <SeverityBar value={result.confidenceScore} className="Confidence" />
      </div>

      <p className={styles.cardExplanation}>{result.explanation}</p>
      <p className={styles.cardSummary}>{result.behaviorSummary}</p>
      <div className={styles.evidenceTagRow}>
        <span className={styles.evidenceTag}>{result.evidenceQuality || "Low evidence"}</span>
      </div>

      <div className={styles.sparklineWrap}>
        <ResponsiveContainer width="100%" height={44}>
          <LineChart data={sparklineData}>
            <Tooltip
              cursor={false}
              formatter={(value) => `${Math.round(Number(value) * 100)}%`}
              labelFormatter={(label) => new Date(label).toLocaleString()}
            />
            <Line
              type="monotone"
              dataKey="primary"
              stroke="#7ee7ff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}
