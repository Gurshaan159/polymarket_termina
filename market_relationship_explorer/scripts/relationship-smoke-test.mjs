const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const REQUIRED_MIN_RELATED = 2;
const PER_RUN_SAMPLE_SIZE = 25;
const LOOP_RUNS = 4;

function toArrayResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.markets)) return data.markets;
  return [];
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeMarketsFromEvents(events = []) {
  const normalized = [];
  for (const event of events) {
    const eventMarkets = Array.isArray(event?.markets) ? event.markets : [];
    for (const market of eventMarkets) {
      const id = String(market?.id || market?.marketId || market?.slug || "");
      const marketTitle = market?.question || market?.title || market?.name || "";
      if (!id || !marketTitle) continue;
      const eventTitle = event?.title || event?.name || "";
      const tags = unique(
        [
          ...(Array.isArray(event?.tags) ? event.tags : []),
          ...(Array.isArray(market?.tags) ? market.tags : []),
        ].map((tag) => (typeof tag === "string" ? normalizeText(tag) : "")),
      );
      const tokenIds = unique([
        ...(Array.isArray(market?.tokens)
          ? market.tokens.map((token) => token?.token_id || token?.tokenId)
          : []),
      ]);
      normalized.push({
        eventId: String(event?.id || event?.eventId || ""),
        eventTitle,
        marketId: id,
        marketTitle,
        category: normalizeText(event?.category || market?.category || "uncategorized"),
        sportOrLeague: normalizeText(
          event?.sport || event?.league || market?.sport || market?.league || "",
        ),
        tags,
        entities: [],
        tokenIds,
        liquidity:
          Number(market?.liquidityNum) ||
          Number(market?.liquidity) ||
          Number(event?.liquidity) ||
          0,
        volume:
          Number(market?.volumeNum) || Number(market?.volume) || Number(event?.volume) || 0,
        textTokens: tokenize(`${marketTitle} ${eventTitle} ${tags.join(" ")}`),
      });
    }
  }
  return normalized;
}

function jaccardSimilarity(tokensA = [], tokensB = []) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function buildFallbackEdge(source, target) {
  let score = 0;
  if (source.category && source.category === target.category) score += 6;
  if (
    source.sportOrLeague &&
    target.sportOrLeague &&
    source.sportOrLeague === target.sportOrLeague
  ) {
    score += 5;
  }
  const text = jaccardSimilarity(source.textTokens, target.textTokens);
  if (text > 0) score += Math.max(2, text * 10);
  if (score <= 0) score = 1;
  return {
    sourceMarketId: source.marketId,
    targetMarketId: target.marketId,
    score: Math.round(score * 100) / 100,
  };
}

function scoreRelationship(source, target) {
  if (!source || !target || source.marketId === target.marketId) return null;
  let score = 0;
  if (source.eventId && source.eventId === target.eventId) score += 30;
  if (source.category && source.category === target.category) score += 8;
  if (
    source.sportOrLeague &&
    target.sportOrLeague &&
    source.sportOrLeague === target.sportOrLeague
  ) {
    score += 8;
  }
  const text = jaccardSimilarity(source.textTokens, target.textTokens);
  if (text >= 0.08) score += text * 10;
  if (score <= 0) return null;
  return {
    sourceMarketId: source.marketId,
    targetMarketId: target.marketId,
    score: Math.round(Math.min(score, 100) * 100) / 100,
  };
}

function buildRelationshipGraph(markets, selectedMarketId, limit = 12) {
  const selectedId = String(selectedMarketId || "");
  const selected = markets.find((market) => String(market.marketId) === selectedId) || null;
  if (!selected) return { center: null, edges: [] };
  const targetEdgeCount = Math.min(Math.max(limit, REQUIRED_MIN_RELATED), Math.max(markets.length - 1, 0));
  const scoredEdges = markets
    .filter((market) => String(market.marketId) !== String(selected.marketId))
    .map((market) => scoreRelationship(selected, market))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const edgeByTarget = new Map(scoredEdges.map((edge) => [edge.targetMarketId, edge]));
  if (scoredEdges.length < targetEdgeCount) {
    const fallbackEdges = markets
      .filter((market) => String(market.marketId) !== String(selected.marketId))
      .filter((market) => !edgeByTarget.has(market.marketId))
      .map((market) => buildFallbackEdge(selected, market))
      .sort((a, b) => b.score - a.score);
    for (const edge of fallbackEdges) {
      scoredEdges.push(edge);
      if (scoredEdges.length >= targetEdgeCount) break;
    }
  }
  return { center: selected, edges: scoredEdges.slice(0, targetEdgeCount) };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchUniverseEvents() {
  const eventsEndpoints = [
    `${GAMMA_BASE_URL}/events?active=true&closed=false&limit=350`,
    `${GAMMA_BASE_URL}/events?closed=false&limit=350`,
    `${GAMMA_BASE_URL}/events?limit=350`,
  ];
  let events = [];
  for (const url of eventsEndpoints) {
    try {
      const payload = await fetchJson(url);
      events = toArrayResponse(payload);
      if (events.length) break;
    } catch {
      // Try next endpoint candidate.
    }
  }

  const hasEmbeddedMarkets = events.some(
    (event) => Array.isArray(event?.markets) && event.markets.length > 0,
  );
  if (hasEmbeddedMarkets) return events;

  const marketEndpoints = [
    `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=900`,
    `${GAMMA_BASE_URL}/markets?closed=false&limit=900`,
    `${GAMMA_BASE_URL}/markets?limit=900`,
  ];
  for (const url of marketEndpoints) {
    try {
      const payload = await fetchJson(url);
      const markets = toArrayResponse(payload);
      if (markets.length) {
        return toSyntheticEventsFromMarkets(markets);
      }
    } catch {
      // Try next endpoint candidate.
    }
  }

  throw new Error("Unable to fetch Gamma market universe for smoke test.");
}

function pickDeterministicSample(markets, runIndex, sampleSize) {
  const sorted = [...markets].sort((a, b) => {
    const aScore = (a.liquidity || 0) * 0.7 + (a.volume || 0) * 0.3;
    const bScore = (b.liquidity || 0) * 0.7 + (b.volume || 0) * 0.3;
    if (bScore !== aScore) return bScore - aScore;
    return a.marketId.localeCompare(b.marketId);
  });

  if (sorted.length <= sampleSize) return sorted;

  // Rotate sample start across runs to test different segments.
  const offset = (runIndex * 7) % sorted.length;
  const sample = [];
  for (let i = 0; i < sampleSize; i += 1) {
    sample.push(sorted[(offset + i) % sorted.length]);
  }
  return sample;
}

function assertMinRelated(markets, sampleMarkets) {
  const failures = [];
  for (const market of sampleMarkets) {
    const graph = buildRelationshipGraph(markets, market.marketId, REQUIRED_MIN_RELATED);
    const relatedCount = graph?.edges?.length || 0;
    if (relatedCount < REQUIRED_MIN_RELATED) {
      failures.push({
        marketId: market.marketId,
        marketTitle: market.marketTitle,
        relatedCount,
      });
    }
  }
  return failures;
}

async function run() {
  const events = await fetchUniverseEvents();
  const markets = normalizeMarketsFromEvents(events);
  if (markets.length < REQUIRED_MIN_RELATED + 1) {
    throw new Error(
      `Only ${markets.length} normalized markets loaded; need at least ${
        REQUIRED_MIN_RELATED + 1
      }.`,
    );
  }

  console.log(
    `Universe loaded: ${markets.length} markets, running ${LOOP_RUNS} smoke-test passes.`,
  );

  for (let runIndex = 0; runIndex < LOOP_RUNS; runIndex += 1) {
    const sample = pickDeterministicSample(markets, runIndex, PER_RUN_SAMPLE_SIZE);
    const failures = assertMinRelated(markets, sample);
    if (failures.length) {
      const preview = failures
        .slice(0, 6)
        .map((f) => `${f.marketId} (${f.relatedCount}) ${f.marketTitle}`)
        .join("\n- ");
      throw new Error(
        `Run ${runIndex + 1}/${LOOP_RUNS} failed (${failures.length} markets below ${REQUIRED_MIN_RELATED} related)\n- ${preview}`,
      );
    }
    console.log(
      `Run ${runIndex + 1}/${LOOP_RUNS} passed for ${sample.length} sampled markets (>= ${REQUIRED_MIN_RELATED} related each).`,
    );
  }

  console.log("Relationship smoke-test loop passed.");
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
