import React, { useState } from "react";
import { MarketReliabilityPanel } from "./index";

export default function App() {
  const [tokenId, setTokenId] = useState("");
  const [conditionId, setConditionId] = useState("");

  return (
    <>
      <div style={{ padding: "0.75rem", background: "#0b1120", color: "#e2e8f0", display: "flex", gap: "0.75rem" }}>
        <label>
          Token ID:&nbsp;
          <input value={tokenId} onChange={(event) => setTokenId(event.target.value)} placeholder="token_id" />
        </label>
        <label>
          Condition ID:&nbsp;
          <input
            value={conditionId}
            onChange={(event) => setConditionId(event.target.value)}
            placeholder="condition_id"
          />
        </label>
      </div>
      <MarketReliabilityPanel tokenId={tokenId || undefined} conditionId={conditionId || tokenId || undefined} />
    </>
  );
}
