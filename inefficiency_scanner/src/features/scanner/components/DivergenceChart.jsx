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

export function DivergenceChart({ data }) {
  if (!data?.length) return <div className={styles.emptyState}>No divergence chart data available.</div>;

  return (
    <div className={styles.chartWrap}>
      <h4 className={styles.chartTitle}>Probability Alignment</h4>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid stroke="#253048" strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tick={{ fill: "#c6d1e4", fontSize: 11 }}
          />
          <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#c6d1e4", fontSize: 11 }} />
          <Tooltip
            formatter={(value) => `${Math.round(Number(value) * 100)}%`}
            labelFormatter={(value) => new Date(value).toLocaleString()}
          />
          <Legend />
          <Line dataKey="primary" name="Primary market" stroke="#7ee7ff" dot={false} strokeWidth={2} />
          <Line dataKey="related" name="Related market" stroke="#ffb86b" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <h4 className={styles.chartTitle}>Gap Over Time</h4>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data}>
          <CartesianGrid stroke="#253048" strokeDasharray="3 3" />
          <XAxis hide dataKey="timestamp" />
          <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#c6d1e4", fontSize: 11 }} />
          <Tooltip formatter={(value) => `${Math.round(Number(value) * 100)} pts`} />
          <Line dataKey="gap" name="Gap" stroke="#ff6b7a" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
