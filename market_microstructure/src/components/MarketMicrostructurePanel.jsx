import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  Area
} from "recharts";
import { fetchMarketPriceHistory } from "../lib/api";
import { enrichMicrostructureSeries, extractPriceHistoryRows } from "../utils/series";
import "../styles.css";

function useResolvedMarketId(explicitMarketId) {
  return useMemo(() => {
    if (explicitMarketId) {
      return explicitMarketId;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("marketId") ?? params.get("conditionId");
  }, [explicitMarketId]);
}

export default function MarketMicrostructurePanel({ marketId }) {
  const resolvedMarketId = useResolvedMarketId(marketId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [series, setSeries] = useState([]);
  const [showVelocity, setShowVelocity] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showVolatility, setShowVolatility] = useState(true);

  useEffect(() => {
    if (!resolvedMarketId) {
      setError("Provide a marketId or conditionId to load microstructure data.");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const payload = await fetchMarketPriceHistory(resolvedMarketId);
        if (!isMounted) {
          return;
        }

        const normalized = enrichMicrostructureSeries(extractPriceHistoryRows(payload));
        setSeries(normalized);
        setError("");
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }
        setError(fetchError.message || "Failed to load market microstructure data.");
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
  }, [resolvedMarketId]);

  const inflections = useMemo(() => series.filter((point) => point.inflection), [series]);

  return (
    <section className="microstructure-panel">
      <header className="micro-header">
        <div>
          <h2>Market Microstructure</h2>
          <p>Condition: {resolvedMarketId ?? "not set"}</p>
        </div>
        <div className="toggle-row">
          <label>
            <input type="checkbox" checked={showVelocity} onChange={() => setShowVelocity((s) => !s)} />
            Velocity
          </label>
          <label>
            <input type="checkbox" checked={showVolume} onChange={() => setShowVolume((s) => !s)} />
            Volume
          </label>
          <label>
            <input type="checkbox" checked={showVolatility} onChange={() => setShowVolatility((s) => !s)} />
            Volatility Band
          </label>
        </div>
      </header>

      {isLoading && <p className="status">Loading price history...</p>}
      {error && <p className="status error">{error}</p>}

      {!isLoading && !error && (
        <>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={series} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#1f2937" />
                <XAxis dataKey="timeLabel" minTickGap={32} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                />
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                <Legend />

                {showVolatility && (
                  <>
                    <Area type="monotone" dataKey="upperBand" stroke="none" fill="#334155" fillOpacity={0.25} />
                    <Area type="monotone" dataKey="lowerBand" stroke="none" fill="#111827" fillOpacity={1} />
                  </>
                )}

                <Line
                  type="monotone"
                  dataKey="probability"
                  name="Probability"
                  stroke="#22d3ee"
                  strokeWidth={2.2}
                  dot={false}
                />

                {inflections.map((point) => (
                  <ReferenceDot
                    key={`inflection-${point.timestamp}`}
                    x={point.timeLabel}
                    y={point.probability}
                    r={4}
                    fill="#f97316"
                    label={{ value: "Inflection", position: "top", fill: "#fbbf24", fontSize: 10 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {(showVelocity || showVolume || showVolatility) && (
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#1f2937" />
                  <XAxis dataKey="timeLabel" minTickGap={32} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip />
                  <Legend />

                  {showVolume && (
                    <Bar
                      yAxisId="right"
                      dataKey="volume"
                      name="Volume"
                      fill="#3b82f6"
                      barSize={6}
                      opacity={0.5}
                    />
                  )}
                  {showVelocity && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="velocity"
                      name="Change Velocity (%/h)"
                      stroke="#f59e0b"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  )}
                  {showVolatility && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="volatility"
                      name="Rolling Volatility"
                      stroke="#a78bfa"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  );
}
