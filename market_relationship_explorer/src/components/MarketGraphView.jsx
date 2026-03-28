import { useMemo } from "react";
import { MarketEdge } from "./MarketEdge";
import { MarketNode } from "./MarketNode";
import styles from "../styles/MarketGraphView.module.css";

const VIEW_WIDTH = 940;
const VIEW_HEIGHT = 640;

function radialPositions(center, surroundingMarkets) {
  const cx = VIEW_WIDTH / 2;
  const cy = VIEW_HEIGHT / 2;
  const innerRadius = Math.min(VIEW_WIDTH, VIEW_HEIGHT) * 0.28;
  const outerRadius = Math.min(VIEW_WIDTH, VIEW_HEIGHT) * 0.38;

  const positions = new Map();
  positions.set(center.marketId, { x: cx, y: cy });

  surroundingMarkets.forEach((market, index) => {
    const total = Math.max(surroundingMarkets.length, 1);
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const useOuterRing = total > 5 && index % 2 === 1;
    const radius = useOuterRing ? outerRadius : innerRadius;
    const jitter = ((index % 3) - 1) * 14;
    positions.set(market.marketId, {
      x: cx + Math.cos(angle) * (radius + jitter),
      y: cy + Math.sin(angle) * (radius + jitter),
    });
  });

  return positions;
}

export function MarketGraphView({
  centerMarket,
  nodes,
  edges,
  onSelectNode,
  onSelectEdge,
  selectedEdge,
  onHoverSummaryChange,
}) {
  if (!centerMarket) return null;

  const relatedMarkets = useMemo(
    () => nodes.filter((node) => node.marketId !== centerMarket.marketId),
    [nodes, centerMarket.marketId],
  );

  const positions = useMemo(
    () => radialPositions(centerMarket, relatedMarkets),
    [centerMarket, relatedMarkets],
  );

  return (
    <div className={styles.graphCard}>
      <div className={styles.graphCanvasWrap}>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className={styles.graphSvg}>
          {edges.map((edge) => {
            const from = positions.get(edge.sourceMarketId);
            const to = positions.get(edge.targetMarketId);
            if (!from || !to) return null;
            const isActive =
              selectedEdge &&
              selectedEdge.sourceMarketId === edge.sourceMarketId &&
              selectedEdge.targetMarketId === edge.targetMarketId;
            return (
              <MarketEdge
                key={`${edge.sourceMarketId}-${edge.targetMarketId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strength={edge.score}
                isActive={Boolean(isActive)}
                onClick={() => onSelectEdge(edge)}
                onMouseEnter={() =>
                  onHoverSummaryChange(
                    `${Math.round(edge.score)} score · ${edge.reasons
                      .slice(0, 2)
                      .map((reason) => reason.label)
                      .join(", ")}`,
                  )
                }
                onMouseLeave={() => onHoverSummaryChange(null)}
              />
            );
          })}

          {nodes.map((market) => {
            const position = positions.get(market.marketId);
            if (!position) return null;
            const isCenter = market.marketId === centerMarket.marketId;
            return (
              <MarketNode
                key={market.marketId}
                x={position.x}
                y={position.y}
                radius={isCenter ? 60 : 40}
                label={market.marketTitle}
                sublabel={market.eventTitle}
                isCenter={isCenter}
                onClick={() => {
                  if (!isCenter) onSelectNode(market);
                }}
                onMouseEnter={() => onHoverSummaryChange(`${market.marketTitle} · ${market.category}`)}
                onMouseLeave={() => onHoverSummaryChange(null)}
              />
            );
          })}
        </svg>
      </div>

      <div className={styles.legend}>
        <span>{edges.length} related markets shown</span>
        <span>Edge thickness/opacity = relationship strength</span>
        <span>Click node to recenter graph</span>
        <span>Click edge for reason breakdown</span>
      </div>

      {edges.length === 0 ? (
        <div className={styles.emptyRelationships}>
          No strong related markets for this selection with current filters.
        </div>
      ) : (
        <div className={styles.relationshipList}>
          {edges.map((edge) => {
            const target = relatedMarkets.find((market) => market.marketId === edge.targetMarketId);
            if (!target) return null;
            return (
              <button
                key={`relationship-${edge.targetMarketId}`}
                type="button"
                className={styles.relationshipItem}
                onClick={() => onSelectNode(target)}
              >
                <span className={styles.relationshipTitle}>{target.marketTitle}</span>
                <span className={styles.relationshipMeta}>score {edge.score}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
