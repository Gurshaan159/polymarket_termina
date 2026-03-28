import { SIGNAL_META } from "../types";
import styles from "../scanner.module.css";

export function ScannerFilters({ filters, setFilters, categoryOptions, sportOptions, onReset }) {
  function patchFilters(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <section className={styles.filtersCard}>
      <div className={styles.filtersRow}>
        <label className={styles.controlLabel}>
          Search
          <input
            className={styles.input}
            value={filters.search}
            placeholder="Market, event, signal..."
            onChange={(event) => patchFilters({ search: event.target.value })}
          />
        </label>

        <label className={styles.controlLabel}>
          Signal Type
          <select
            className={styles.select}
            value={filters.signalType}
            onChange={(event) => patchFilters({ signalType: event.target.value })}
          >
            <option value="all">All signals</option>
            {Object.entries(SIGNAL_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.controlLabel}>
          Category
          <select
            className={styles.select}
            value={filters.category}
            onChange={(event) => patchFilters({ category: event.target.value })}
          >
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.controlLabel}>
          Sport / League
          <select
            className={styles.select}
            value={filters.sport}
            onChange={(event) => patchFilters({ sport: event.target.value })}
          >
            <option value="all">All sports/leagues</option>
            {sportOptions.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.filtersRow}>
        <label className={styles.sliderLabel}>
          Severity {filters.minSeverity}+
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={100}
            value={filters.minSeverity}
            onChange={(event) => patchFilters({ minSeverity: Number(event.target.value) })}
          />
        </label>

        <label className={styles.sliderLabel}>
          Confidence {filters.minConfidence}+
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={100}
            value={filters.minConfidence}
            onChange={(event) => patchFilters({ minConfidence: Number(event.target.value) })}
          />
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={filters.activeOnly}
            onChange={(event) => patchFilters({ activeOnly: event.target.checked })}
          />
          Active-only
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={filters.multiMarketOnly}
            onChange={(event) => patchFilters({ multiMarketOnly: event.target.checked })}
          />
          Multi-market signals only
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={filters.thinOnly}
            onChange={(event) => patchFilters({ thinOnly: event.target.checked })}
          />
          Thin-market warnings only
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={filters.showWatchlist}
            onChange={(event) => patchFilters({ showWatchlist: event.target.checked })}
          />
          Show watchlist signals
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={filters.showInsufficient}
            onChange={(event) => patchFilters({ showInsufficient: event.target.checked })}
          />
          Show insufficient-evidence results
        </label>
        <button className={styles.ghostButton} type="button" onClick={onReset}>
          Reset Filters
        </button>
      </div>
    </section>
  );
}
