import { fetchJsonWithRetry } from "./httpClient";

const CLOB_BASE_URL = import.meta.env.VITE_CLOB_BASE_URL || "/api/clob";

function parseHistoryPoints(data) {
  const rows = Array.isArray(data) ? data : data?.history || data?.prices || [];

  function normalizeTimestamp(rawTs) {
    if (rawTs === null || rawTs === undefined) return null;
    const numericTs = Number(rawTs);
    if (Number.isFinite(numericTs)) {
      const millis = numericTs > 10_000_000_000 ? numericTs : numericTs * 1000;
      const date = new Date(millis);
      if (!Number.isFinite(date.getTime())) return null;
      return date.toISOString();
    }
    const parsed = new Date(rawTs);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  function normalizePrice(rawPrice) {
    const price = Number(rawPrice);
    if (!Number.isFinite(price)) return null;
    if (price > 1 && price <= 100) return price / 100;
    return price;
  }

  return rows
    .map((row) => {
      const tupleTs = Array.isArray(row) ? row[0] : null;
      const tuplePrice = Array.isArray(row) ? row[1] : null;
      const ts = row?.t ?? row?.ts ?? row?.timestamp ?? row?.time ?? tupleTs;
      const price = normalizePrice(row?.p ?? row?.price ?? row?.value ?? tuplePrice);
      if (!ts || !Number.isFinite(price)) return null;
      const isoTs = normalizeTimestamp(ts);
      if (!isoTs) return null;
      return {
        timestamp: isoTs,
        price,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function fetchMarketBook(tokenId) {
  if (!tokenId) return null;
  const urls = [
    `${CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`,
    `${CLOB_BASE_URL}/orderbook?token_id=${encodeURIComponent(tokenId)}`,
  ];

  for (const url of urls) {
    try {
      return await fetchJsonWithRetry(url, { timeoutMs: 10000, retries: 1 });
    } catch {
      // Try alternate endpoint.
    }
  }
  return null;
}

export async function fetchMarketPriceHistory(tokenId, interval = "1d") {
  if (!tokenId) return [];
  const urls = [
    `${CLOB_BASE_URL}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}`,
    `${CLOB_BASE_URL}/prices-history?token_id=${encodeURIComponent(tokenId)}&interval=${interval}`,
    `${CLOB_BASE_URL}/price-history?token_id=${encodeURIComponent(tokenId)}&interval=${interval}`,
    `${CLOB_BASE_URL}/history?token_id=${encodeURIComponent(tokenId)}&interval=${interval}`,
  ];

  for (const url of urls) {
    try {
      const data = await fetchJsonWithRetry(url, { timeoutMs: 10000, retries: 1 });
      const points = parseHistoryPoints(data);
      if (points.length) return points;
    } catch {
      // Try alternate endpoint.
    }
  }
  return [];
}

export function deriveMovementSignal(historyPoints) {
  if (!Array.isArray(historyPoints) || historyPoints.length < 3) {
    return null;
  }

  const first = historyPoints[0].price;
  const last = historyPoints[historyPoints.length - 1].price;
  const delta = last - first;
  const direction = delta > 0.01 ? "up" : delta < -0.01 ? "down" : "flat";
  const volatility =
    historyPoints.reduce((acc, point, index) => {
      if (index === 0) return acc;
      return acc + Math.abs(point.price - historyPoints[index - 1].price);
    }, 0) /
    (historyPoints.length - 1);

  return {
    direction,
    delta,
    volatility,
    latestPrice: last,
  };
}
