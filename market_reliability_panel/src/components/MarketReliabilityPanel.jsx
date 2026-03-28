import React, { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchOrderBook, fetchVolumeHistory } from "../lib/api";
import {
  computeDepthWithinFivePercent,
  computeReliabilityScore,
  computeSpread,
  describeReliability,
  estimateSlippageUsd,
  extractDailyVolumeSeries,
  normalizeBookLevels,
  scoreColorClass
} from "../utils/reliability";
import "../styles.css";

const formatPercent = (decimal) => `${(decimal * 100).toFixed(2)}%`;
const formatCurrency = (value, digits = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(
    value
  );

function resolveIds(props) {
  const tokenId = props.tokenId ?? props.marketId ?? props.conditionId;
  const conditionId = props.conditionId ?? props.marketId ?? props.tokenId;
  return { tokenId, conditionId };
}

export default function MarketReliabilityPanel(props) {
  const { tokenId, conditionId } = useMemo(() => resolveIds(props), [props]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookPayload, setBookPayload] = useState(null);
  const [volumeSeries, setVolumeSeries] = useState([]);

  useEffect(() => {
    if (!tokenId || !conditionId) {
      setError("Provide tokenId or marketId/conditionId to evaluate reliability.");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const [book, volumeHistory] = await Promise.all([fetchOrderBook(tokenId), fetchVolumeHistory(conditionId)]);
        if (!isMounted) {
          return;
        }

        setBookPayload(book);
        setVolumeSeries(extractDailyVolumeSeries(volumeHistory));
        setError("");
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }
        setError(fetchError.message || "Failed to load reliability diagnostics.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [tokenId, conditionId]);

  const metrics = useMemo(() => {
    const bids = normalizeBookLevels(bookPayload?.bids);
    const asks = normalizeBookLevels(bookPayload?.asks);
    const { bestAsk, bestBid, spread } = computeSpread(bids, asks);
    const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : 0;
    const depthUsd = computeDepthWithinFivePercent(mid, bids, asks);
    const slippageUsd = estimateSlippageUsd(asks, 500);
    const latestRollingVolume = volumeSeries[volumeSeries.length - 1]?.rollingVolume ?? 0;
    const score = computeReliabilityScore({
      depthUsd,
      spreadDecimal: spread,
      rollingVolume: latestRollingVolume
    });

    return {
      bestAsk,
      bestBid,
      spread,
      depthUsd,
      slippageUsd,
      latestRollingVolume,
      score,
      summary: describeReliability(score, spread, depthUsd, slippageUsd)
    };
  }, [bookPayload, volumeSeries]);

  return (
    <section className="reliability-panel">
      <header>
        <h2>Market Reliability Diagnostics</h2>
        <p>Token: {tokenId ?? "n/a"}</p>
      </header>

      {isLoading && <p className="status-box">Loading order book and volume trend...</p>}
      {error && <p className="status-box error">{error}</p>}

      {!isLoading && !error && (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <h4>Bid-ask spread</h4>
              <p>{formatPercent(metrics.spread)}</p>
              <small>{`${(metrics.spread * 100).toFixed(2)} cents`}</small>
            </article>
            <article className="metric-card">
              <h4>Depth within 5% of mid</h4>
              <p>{formatCurrency(metrics.depthUsd, 0)}</p>
              <small>{`Best bid ${formatPercent(metrics.bestBid)} / ask ${formatPercent(metrics.bestAsk)}`}</small>
            </article>
            <article className="metric-card">
              <h4>Estimated slippage ($500)</h4>
              <p>{formatCurrency(metrics.slippageUsd, 2)}</p>
              <small>Order-book walk across asks</small>
            </article>
            <article className={`metric-card reliability-score ${scoreColorClass(metrics.score)}`}>
              <h4>Reliability score</h4>
              <p>{metrics.score}/100</p>
              <small>Depth 40% / Spread 30% / Volume 30%</small>
            </article>
          </div>

          <div className="volume-card">
            <div className="volume-header">
              <h4>7-day rolling volume trend</h4>
              <span>{formatCurrency(metrics.latestRollingVolume, 0)}</span>
            </div>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={volumeSeries}>
                <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
                <Line
                  type="monotone"
                  dataKey="rollingVolume"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="summary-line">{metrics.summary}</p>
        </>
      )}
    </section>
  );
}
