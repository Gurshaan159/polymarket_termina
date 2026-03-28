import { fetchJsonWithRetry } from "./httpClient";

const GAMMA_BASE_URL =
  import.meta.env.VITE_GAMMA_BASE_URL || "/api/gamma";

function toArrayResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.markets)) return data.markets;
  return [];
}

export async function fetchActiveEvents(limit = 250) {
  const candidates = [
    `${GAMMA_BASE_URL}/events?active=true&closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/events?closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/events?limit=${limit}`,
  ];

  let lastError;
  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, { timeoutMs: 12000, retries: 2 });
      const events = toArrayResponse(data);
      if (events.length) return events;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch events from Gamma API");
}

function toSyntheticEventsFromMarkets(markets = []) {
  const byEvent = new Map();
  for (const market of markets) {
    const eventId = String(market?.eventId || market?.event_id || market?.seriesId || "unknown");
    const existing = byEvent.get(eventId);
    if (existing) {
      existing.markets.push(market);
      continue;
    }
    byEvent.set(eventId, {
      id: eventId,
      title: market?.eventTitle || market?.event || market?.groupItemTitle || "Market event",
      category: market?.category || market?.topic || "uncategorized",
      active: market?.active ?? true,
      closed: market?.closed ?? false,
      tags: market?.tags || [],
      markets: [market],
    });
  }
  return Array.from(byEvent.values());
}

export async function fetchActiveMarkets(limit = 600) {
  const candidates = [
    `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/markets?closed=false&limit=${limit}`,
    `${GAMMA_BASE_URL}/markets?limit=${limit}`,
  ];

  let lastError;
  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, { timeoutMs: 12000, retries: 2 });
      const markets = toArrayResponse(data);
      if (markets.length) return markets;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch markets from Gamma API");
}

export async function fetchGammaMarketUniverse(limit = 300) {
  let events = [];
  let usedFallbackMarketsEndpoint = false;
  let firstError = null;

  try {
    events = await fetchActiveEvents(limit);
  } catch (error) {
    firstError = error;
  }

  const hasEmbeddedMarkets = events.some((event) => Array.isArray(event?.markets) && event.markets.length > 0);
  if (!hasEmbeddedMarkets) {
    try {
      const markets = await fetchActiveMarkets(Math.max(limit * 2, 500));
      events = toSyntheticEventsFromMarkets(markets);
      usedFallbackMarketsEndpoint = true;
    } catch (marketsError) {
      if (!events.length) {
        throw firstError || marketsError;
      }
    }
  }

  return {
    events,
    usedFallbackMarketsEndpoint,
  };
}
