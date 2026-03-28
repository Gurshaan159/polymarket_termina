import { fetchJsonWithRetry } from "./httpClient";

const CLOB_BASE_URL = "/api/clob";

function normalizeTimestamp(rawTs) {
  if (rawTs === null || rawTs === undefined) return null;
  const numeric = Number(rawTs);
  if (Number.isFinite(numeric)) {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const date = new Date(rawTs);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizePrice(rawPrice) {
  const price = Number(rawPrice);
  if (!Number.isFinite(price)) return null;
  if (price > 1 && price <= 100) return price / 100;
  return price >= 0 && price <= 1 ? price : null;
}

function parseHistoryRows(data) {
  const rows = Array.isArray(data) ? data : data?.history || data?.prices || data?.data || [];
  return rows
    .map((row) => {
      const tupleTs = Array.isArray(row) ? row[0] : null;
      const tuplePrice = Array.isArray(row) ? row[1] : null;
      const ts = row?.t ?? row?.ts ?? row?.timestamp ?? row?.time ?? tupleTs;
      const price = normalizePrice(row?.p ?? row?.price ?? row?.value ?? tuplePrice);
      if (!ts || price === null) return null;
      const isoTs = normalizeTimestamp(ts);
      if (!isoTs) return null;
      return { timestamp: isoTs, price };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function parseBookRows(levels) {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((row) => {
      const price = Number(row?.price ?? row?.[0]);
      const size = Number(row?.size ?? row?.quantity ?? row?.[1]);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter(Boolean)
    .sort((a, b) => b.price - a.price);
}

export async function fetchMarketPriceHistory(tokenId, interval = "1h") {
  if (!tokenId) return [];
  // Keep endpoint probing shallow so scanner loads quickly.
  const candidates = [
    `${CLOB_BASE_URL}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}`,
    `${CLOB_BASE_URL}/prices-history?token_id=${encodeURIComponent(tokenId)}&interval=${interval}`,
  ];

  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, { timeoutMs: 3500, retries: 0 });
      const history = parseHistoryRows(data);
      if (history.length) return history;
    } catch {
      // Keep probing alternative endpoints.
    }
  }

  return [];
}

export async function fetchMarketBook(tokenId) {
  if (!tokenId) return null;
  const candidates = [
    `${CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`,
    `${CLOB_BASE_URL}/orderbook?token_id=${encodeURIComponent(tokenId)}`,
  ];

  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, { timeoutMs: 3000, retries: 0 });
      const bids = parseBookRows(data?.bids || data?.buy || []);
      const asks = parseBookRows(data?.asks || data?.sell || []).sort((a, b) => a.price - b.price);
      const bestBid = bids[0]?.price ?? null;
      const bestAsk = asks[0]?.price ?? null;
      const spread = bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null;
      const depth = bids.slice(0, 5).reduce((acc, row) => acc + row.size, 0) +
        asks.slice(0, 5).reduce((acc, row) => acc + row.size, 0);

      return {
        bestBid,
        bestAsk,
        spread,
        depth,
      };
    } catch {
      // Keep probing alternative endpoints.
    }
  }

  return null;
}
