import { TIME_HORIZONS } from "../types";
import styles from "../scanner.module.css";

function formatUpdatedAt(lastUpdated) {
  if (!lastUpdated) return "Not loaded";
  return new Date(lastUpdated).toLocaleTimeString();
}

export function ScannerToolbar({
  horizon,
  onHorizonChange,
  onRefresh,
  loading,
  lastUpdated,
  resultCount,
}) {
  return (
    <header className={styles.toolbar}>
      <div>
        <h1 className={styles.title}>Divergence & Inefficiency Scanner</h1>
        <p className={styles.subtitle}>
          Ranked behavioral and liquidity anomalies across active Polymarket markets.
        </p>
      </div>

      <div className={styles.toolbarControls}>
        <label className={styles.controlLabel}>
          Time Horizon
          <select
            className={styles.select}
            value={horizon}
            onChange={(event) => onHorizonChange(event.target.value)}
          >
            {Object.entries(TIME_HORIZONS).map(([value, info]) => (
              <option key={value} value={value}>
                {info.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.refreshButton} onClick={onRefresh}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className={styles.toolbarMeta}>
        <span>{resultCount} flagged results</span>
        <span>Updated {formatUpdatedAt(lastUpdated)}</span>
      </div>
    </header>
  );
}
