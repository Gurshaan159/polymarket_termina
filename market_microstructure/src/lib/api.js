const CLOB_BASE_URL = "https://clob.polymarket.com";

export async function fetchMarketPriceHistory(conditionId) {
  const query = new URLSearchParams({
    market: String(conditionId),
    interval: "1d",
    fidelity: "60"
  });

  const response = await fetch(`${CLOB_BASE_URL}/prices-history?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch price history (${response.status})`);
  }

  return response.json();
}
