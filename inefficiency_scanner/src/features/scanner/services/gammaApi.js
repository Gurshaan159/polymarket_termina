import { fetchJsonWithRetry } from "./httpClient";

const GAMMA_BASE_URL = "/api/gamma";

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.markets)) return data.markets;
  return [];
}

export async function fetchActiveMarkets(limit = 600) {
  const candidates = [
    `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/markets?closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/markets?limit=${limit}`,
  ];

  let lastError = null;
  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, { retries: 2, timeoutMs: 14000 });
      const markets = toArray(data);
      if (markets.length) return markets;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch active markets from Gamma.");
}
