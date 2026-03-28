import styles from "../styles/MarketGraphView.module.css";

export function MarketEdge({
  x1,
  y1,
  x2,
  y2,
  strength,
  isActive,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) {
  const strokeWidth = 1 + (strength / 100) * 7;
  const opacity = 0.25 + (strength / 100) * 0.75;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className={`${styles.edge} ${isActive ? styles.activeEdge : ""}`}
      strokeWidth={strokeWidth}
      opacity={opacity}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
