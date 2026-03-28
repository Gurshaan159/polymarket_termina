import styles from "../styles/MarketGraphView.module.css";

function compactLabel(value, max = 18) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function MarketNode({
  x,
  y,
  radius,
  label,
  sublabel,
  isCenter = false,
  isActive = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) {
  return (
    <g
      className={`${styles.node} ${isCenter ? styles.centerNode : ""} ${isActive ? styles.activeNode : ""}`}
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <circle r={radius} />
      <text className={styles.nodeLabel} y={-1}>
        {compactLabel(label, isCenter ? 24 : 18)}
      </text>
      {sublabel ? (
        <text className={styles.nodeSubLabel} y={15}>
          {compactLabel(sublabel, isCenter ? 22 : 16)}
        </text>
      ) : null}
    </g>
  );
}
