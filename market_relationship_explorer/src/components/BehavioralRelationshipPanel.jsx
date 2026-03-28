import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import styles from "../styles/MarketDetailsPanel.module.css";

function toSortedPoints(history = []) {
  return (history || [])
    .map((point) => ({
      ts: new Date(point.timestamp).getTime(),
      price: Number(point.price),
    }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price))
    .sort((a, b) => a.ts - b.ts);
}

function dedupeAndDownsampleTimestamps(timestamps, maxPoints = 90) {
  const sorted = [...new Set(timestamps)].sort((a, b) => a - b);
  if (sorted.length <= maxPoints) return sorted;
  const step = Math.ceil(sorted.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < sorted.length; i += step) {
    sampled.push(sorted[i]);
  }
  if (sampled[sampled.length - 1] !== sorted[sorted.length - 1]) {
    sampled.push(sorted[sorted.length - 1]);
  }
  return sampled;
}

function interpolatePrice(points, ts) {
  if (!points.length) return null;
  if (ts < points[0].ts) return null;
  if (ts > points[points.length - 1].ts) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].ts === ts) return points[mid].price;
    if (points[mid].ts < ts) lo = mid + 1;
    else hi = mid - 1;
  }

  const left = points[Math.max(0, hi)];
  const right = points[Math.min(points.length - 1, lo)];
  if (!left || !right) return null;
  if (right.ts === left.ts) return left.price;
  const ratio = (ts - left.ts) / (right.ts - left.ts);
  return left.price + (right.price - left.price) * ratio;
}

function alignHistories(historyA, historyB) {
  const a = toSortedPoints(historyA);
  const b = toSortedPoints(historyB);
  if (!a.length || !b.length) return [];

  const timestamps = dedupeAndDownsampleTimestamps([
    ...a.map((p) => p.ts),
    ...b.map((p) => p.ts),
  ]);

  return timestamps
    .map((ts) => {
      const priceA = interpolatePrice(a, ts);
      const priceB = interpolatePrice(b, ts);
      if (!Number.isFinite(priceA) || !Number.isFinite(priceB)) return null;
      return {
        ts,
        time: new Date(ts).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        marketA: priceA,
        marketB: priceB,
        divergence: Math.abs(priceA - priceB),
      };
    })
    .filter(Boolean);
}

function isSingleDayRange(rows) {
  if (!rows.length) return false;
  const start = new Date(rows[0].ts);
  const end = new Date(rows[rows.length - 1].ts);
  return (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate()
  );
}

function formatAxisLabel(ts, includeTime) {
  const options = includeTime
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return new Date(ts).toLocaleString(undefined, options);
}

function formatTooltipLabel(ts, includeTime) {
  const options = includeTime
    ? {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    : { month: "short", day: "numeric" };
  return new Date(ts).toLocaleString(undefined, options);
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearson(valuesA, valuesB) {
  const n = Math.min(valuesA.length, valuesB.length);
  if (n < 4) return null;
  const meanA = average(valuesA);
  const meanB = average(valuesB);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = valuesA[i] - meanA;
    const db = valuesB[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  if (denom === 0) return null;
  return numerator / denom;
}

function summarizeBehavior(rows) {
  if (!rows.length) return "Insufficient price history for behavioral comparison.";
  const valuesA = rows.map((row) => row.marketA);
  const valuesB = rows.map((row) => row.marketB);
  const allCorr = pearson(valuesA, valuesB);
  const allDiv = average(rows.map((row) => row.divergence));

  const sevenDaysAgo = rows[rows.length - 1].ts - 7 * 24 * 60 * 60 * 1000;
  const recentRows = rows.filter((row) => row.ts >= sevenDaysAgo);
  const recentCorr = pearson(
    recentRows.map((row) => row.marketA),
    recentRows.map((row) => row.marketB),
  );
  const recentDiv = average(recentRows.map((row) => row.divergence));

  const corrText =
    allCorr === null
      ? "limited shared movement data"
      : allCorr > 0.7
        ? "move together strongly"
        : allCorr > 0.35
          ? "show moderate co-movement"
          : allCorr > 0
            ? "show weak co-movement"
            : "often move independently";

  const divergenceText =
    recentDiv < allDiv * 0.85
      ? "and have converged recently"
      : recentDiv > allDiv * 1.15
        ? "but have diverged recently"
        : "with fairly consistent divergence";

  const recentText =
    recentCorr === null
      ? ""
      : recentCorr > 0.65 && (allCorr ?? 0) < 0.45
        ? " Recent 7-day correlation is stronger than the longer history."
        : recentCorr < 0.25 && (allCorr ?? 0) > 0.45
          ? " Recent 7-day correlation weakened versus the longer history."
          : "";

  return `These markets ${corrText}, ${divergenceText}.${recentText}`;
}

function structuralContextLabels(relationship) {
  if (!relationship?.reasons?.length) return [];
  return relationship.reasons
    .filter((reason) => reason.key !== "movement")
    .slice(0, 3)
    .map((reason) => reason.label);
}

export function BehavioralRelationshipPanel({
  marketA,
  marketB,
  marketAHistory,
  marketBHistory,
  relationship,
}) {
  const alignedRows = useMemo(
    () => alignHistories(marketAHistory, marketBHistory),
    [marketAHistory, marketBHistory],
  );
  const showIntradayTime = useMemo(() => isSingleDayRange(alignedRows), [alignedRows]);

  const summary = useMemo(() => summarizeBehavior(alignedRows), [alignedRows]);
  const contextLabels = useMemo(() => structuralContextLabels(relationship), [relationship]);

  if (!marketA || !marketB) {
    return (
      <div className={styles.behaviorEmpty}>
        Select a related market from the graph to compare behavior.
      </div>
    );
  }

  if (!alignedRows.length) {
    return (
      <div className={styles.behaviorEmpty}>
        Price history not available yet for this pair. Try another related market.
      </div>
    );
  }

  return (
    <div className={styles.behaviorWrap}>
      <div className={styles.behaviorTitle}>
        {marketA.marketTitle} vs {marketB.marketTitle}
      </div>

      <div className={styles.behaviorChartBlock}>
        <div className={styles.behaviorChartTitle}>Overlaid probability history</div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={alignedRows}>
            <CartesianGrid stroke="#2a3554" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="ts"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatAxisLabel(value, showIntradayTime)}
              tick={{ fill: "#9db4e0", fontSize: 11 }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(value) => `${Math.round(value * 100)}%`}
              tick={{ fill: "#9db4e0", fontSize: 11 }}
            />
            <Tooltip
              labelFormatter={(value) => formatTooltipLabel(value, showIntradayTime)}
              formatter={(value) => `${Math.round(Number(value) * 100)}%`}
              contentStyle={{
                background: "#0f1526",
                border: "1px solid #34476f",
                color: "#dce9ff",
              }}
            />
            <Line
              type="monotone"
              dataKey="marketA"
              name="Selected market"
              stroke="#57c7ff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="marketB"
              name="Related market"
              stroke="#ff8f6a"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.behaviorChartBlock}>
        <div className={styles.behaviorChartTitle}>Divergence magnitude</div>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={alignedRows}>
            <CartesianGrid stroke="#2a3554" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="ts"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatAxisLabel(value, showIntradayTime)}
              tick={{ fill: "#9db4e0", fontSize: 10 }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(value) => `${Math.round(value * 100)}%`}
              tick={{ fill: "#9db4e0", fontSize: 10 }}
            />
            <Tooltip
              labelFormatter={(value) => formatTooltipLabel(value, showIntradayTime)}
              formatter={(value) => `${Math.round(Number(value) * 100)}%`}
              contentStyle={{
                background: "#0f1526",
                border: "1px solid #34476f",
                color: "#dce9ff",
              }}
            />
            <Area
              type="monotone"
              dataKey="divergence"
              stroke="#a88dff"
              fill="#7f67d433"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.behaviorSummary}>{summary}</div>

      {contextLabels.length ? (
        <div className={styles.structuralFooter}>
          Structural context: {contextLabels.join(", ")}
        </div>
      ) : null}
    </div>
  );
}
