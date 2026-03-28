import { BehavioralRelationshipPanel } from "./BehavioralRelationshipPanel";
import styles from "../styles/MarketDetailsPanel.module.css";

export function MarketDetailsPanel({
  selectedMarket,
  selectedRelationship,
  relatedMarketEnrichment,
  selectedMarketEnrichment,
}) {
  if (!selectedMarket) {
    return <div className={styles.panel}>Select a market to view details.</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Selected Market</div>
        <div className={styles.marketTitle}>{selectedMarket.marketTitle}</div>
        <div className={styles.eventTitle}>{selectedMarket.eventTitle}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Behavioral Relationship</div>
        <BehavioralRelationshipPanel
          marketA={selectedMarket}
          marketB={selectedRelationship?.market || null}
          marketAHistory={selectedMarketEnrichment?.history || []}
          marketBHistory={relatedMarketEnrichment?.history || []}
          relationship={selectedRelationship?.relationship || null}
        />
      </div>
    </div>
  );
}
