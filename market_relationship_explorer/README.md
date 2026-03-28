# Cross-Market Relationship Explorer

Standalone React feature for discovering and exploring explainable relationships between Polymarket markets.

## What it does

- Fetches active events/markets from Gamma API (`https://gamma-api.polymarket.com`)
- Normalizes markets into a consistent internal shape
- Supports fast local search by market title, event title, tags, and entities
- Builds explainable weighted relationship edges (same event, category, entities, wording, movement)
- Renders an interactive SVG node-edge graph
- Enriches selected markets with CLOB market data (`https://clob.polymarket.com`) for history/movement signals
- Shows relationship reason breakdown in a details panel
- Uses Recharts for probability history chart only

## Run locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Main files

- `src/components/CrossMarketRelationshipExplorer.jsx`
- `src/hooks/useMarketsData.js`
- `src/hooks/useRelationshipGraph.js`
- `src/lib/marketNormalization.js`
- `src/lib/relationshipEngine.js`
- `src/services/gammaApi.js`
- `src/services/clobApi.js`

## Integration

The feature entrypoint is `src/components/CrossMarketRelationshipExplorer.jsx`.

You can embed it in a host app by importing that component and ensuring the host app allows browser `fetch` calls to Gamma/CLOB.
