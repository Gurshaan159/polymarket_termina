import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "../scanner.module.css";

export function VolatilityChart({ data }) {
  if (!data?.length) return <div className={styles.emptyState}>No volatility chart data available.</div>;

  return (
    <div className={styles.chartWrap}>
      <h4 className={styles.chartTitle}>Probability + Rolling Movement</h4>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="#253048" strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tick={{ fill: "#c6d1e4", fontSize: 11 }}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 1]}
            tickFormatter={(value) => `${Math.round(value * 100)}%`}
            tick={{ fill: "#c6d1e4", fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(value) => `${Math.round(value * 100)} pts`}
            tick={{ fill: "#c6d1e4", fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) =>
              name === "rollingVolatility"
                ? `${Math.round(Number(value) * 100)} pts`
                : `${Math.round(Number(value) * 100)}%`
            }
            labelFormatter={(value) => new Date(value).toLocaleString()}
          />
          <Legend />
          <Line yAxisId="left" dataKey="primary" name="Probability" stroke="#7ee7ff" dot={false} strokeWidth={2} />
          <Line yAxisId="right" dataKey="rollingVolatility" name="Rolling move" stroke="#ff8f70" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
