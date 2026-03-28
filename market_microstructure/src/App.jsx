import React, { useState } from "react";
import { MarketMicrostructurePanel } from "./index";

export default function App() {
  const [marketId, setMarketId] = useState("");

  return (
    <>
      <div style={{ padding: "0.75rem", background: "#020617", color: "#e2e8f0" }}>
        <label>
          Condition ID:&nbsp;
          <input
            value={marketId}
            onChange={(event) => setMarketId(event.target.value)}
            placeholder="Paste condition ID"
          />
        </label>
      </div>
      <MarketMicrostructurePanel marketId={marketId || undefined} />
    </>
  );
}
