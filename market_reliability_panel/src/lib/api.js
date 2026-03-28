const CLOB_BASE_URL = "https://clob.polymarket.com";

export async function fetchOrderBook(tokenId) {
  const query = new URLSearchParams({ token_id: String(tokenId) });
  const response = await fetch(`${CLOB_BASE_URL}/book?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch order book (${response.status})`);
  }

  return response.json();
}

export async function fetchVolumeHistory(conditionId) {
  const query = new URLSearchParams({
    market: String(conditionId),
    interval: "1d",
    fidelity: "1440"
  });
  const response = await fetch(`${CLOB_BASE_URL}/prices-history?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch volume history (${response.status})`);
  }

  return response.json();
}
