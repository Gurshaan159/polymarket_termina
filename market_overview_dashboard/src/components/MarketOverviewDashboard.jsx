import React, { useEffect, useMemo, useState } from "react";
import { fetchActiveMarkets } from "../lib/api";
import {
  formatCurrency,
  formatProbability,
  formatSignedPercent,
  formatTimeRemaining,
  rankMarkets
} from "../utils/marketMetrics";
import "../styles.css";

const REFRESH_MS = 30_000;

function MarketCard({ item }) {
  return (
    <article className="market-card">
      <h4 className="market-title">{item.title}</h4>
      <div className="market-stats-grid">
        <span>Prob</span>
        <strong>{formatProbability(item.probability)}</strong>
        <span>24h</span>
        <strong className={item.change24h >= 0 ? "positive" : "negative"}>
          {formatSignedPercent(item.change24h)}
        </strong>
        <span>Volume</span>
        <strong>{formatCurrency(item.volume24h)}</strong>
        <span>Ends</span>
        <strong>{formatTimeRemaining(item.timeRemainingHours)}</strong>
      </div>
    </article>
  );
}

function RankedSection({ title, items }) {
  return (
    <section className="dashboard-section">
      <header className="section-header">
        <h3>{title}</h3>
        <span>{items.length} markets</span>
      </header>
      <div className="section-grid">
        {items.map((item, index) => (
          <div key={`${item.market.id ?? item.market.conditionId ?? item.title}-${index}`}>
            <MarketCard item={item} />
          </div>
        ))}
        {items.length === 0 && <p className="empty-hint">No markets match this section right now.</p>}
      </div>
    </section>
  );
}

export default function MarketOverviewDashboard() {
  const [markets, setMarkets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        if (isMounted && markets.length === 0) {
          setIsLoading(true);
        }

        const data = await fetchActiveMarkets(50);
        if (!isMounted) {
          return;
        }

        setMarkets(Array.isArray(data) ? data : []);
        setError("");
        setLastUpdated(new Date());
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }
        setError(fetchError.message || "Failed to load active markets.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    const intervalId = setInterval(load, REFRESH_MS);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [markets.length]);

  const ranked = useMemo(() => rankMarkets(markets), [markets]);

  return (
    <main className="overview-dashboard">
      <header className="dashboard-header">
        <div>
          <h2>Polymarket Real-Time Overview</h2>
          <p>Top activity snapshots across active markets, refreshed every 30 seconds.</p>
        </div>
        <small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Awaiting first refresh"}</small>
      </header>

      {isLoading && <p className="status-banner">Loading active markets...</p>}
      {error && <p className="status-banner error-banner">{error}</p>}

      {!isLoading && !error && (
        <div className="dashboard-grid">
          <RankedSection title="Top Probability Movers" items={ranked.topMovers} />
          <RankedSection title="Highest Volume Markets" items={ranked.highestVolume} />
          <RankedSection title="Volatility Leaders" items={ranked.volatilityLeaders} />
          <RankedSection title="Resolving Soon (48h)" items={ranked.resolvingSoon} />
        </div>
      )}
    </main>
  );
}
