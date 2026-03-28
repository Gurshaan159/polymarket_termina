import {
  extractEntitiesFromText,
  normalizeDate,
  normalizeText,
  tokenize,
  toSafeArray,
} from "./textUtils";

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOutcomes(market) {
  const outcomesRaw =
    market?.outcomes ||
    market?.tokens?.map((token) => token?.outcome) ||
    market?.options ||
    [];
  const pricesRaw =
    market?.outcomePrices ||
    market?.tokens?.map((token) => token?.price) ||
    market?.prices ||
    [];

  const outcomes = toSafeArray(outcomesRaw).map((item) =>
    typeof item === "string" ? item : item?.name || item?.label || String(item),
  );
  const prices = toSafeArray(pricesRaw).map((price) => Number(price));

  return outcomes.map((outcome, index) => ({
    outcome,
    price: Number.isFinite(prices[index]) ? prices[index] : null,
  }));
}

function collectTags(event, market) {
  const rawTags = [
    ...toSafeArray(event?.tags),
    ...toSafeArray(market?.tags),
    ...toSafeArray(event?.topic),
    ...toSafeArray(event?.category),
  ];

  return rawTags
    .map((tag) =>
      typeof tag === "string"
        ? tag
        : tag?.slug || tag?.name || tag?.label || tag?.id || "",
    )
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
}

function deriveEntities(eventTitle, marketTitle, tags = []) {
  const fromText = [
    ...extractEntitiesFromText(eventTitle),
    ...extractEntitiesFromText(marketTitle),
  ];
  const fromTags = tags
    .filter((tag) => tag.includes(" ") || tag.length > 4)
    .map((tag) => tag.replace(/-/g, " "));

  return [...new Set([...fromText, ...fromTags].map((e) => normalizeText(e)).filter(Boolean))];
}

function getSportOrLeague(event, market) {
  return (
    event?.sport ||
    event?.league ||
    market?.sport ||
    market?.league ||
    market?.groupItemTitle ||
    null
  );
}

function getCategory(event, market) {
  return (
    event?.category ||
    market?.category ||
    event?.seriesSlug ||
    market?.seriesSlug ||
    "uncategorized"
  );
}

function getTokenIds(market) {
  const tokensFromField = parseJsonArray(market?.clobTokenIds);
  const tokensFromTokens =
    market?.tokens?.map((token) => token?.token_id || token?.tokenId).filter(Boolean) || [];
  return [...new Set([...tokensFromField, ...tokensFromTokens])];
}

export function normalizeMarketsFromEvents(events = []) {
  const normalized = [];

  for (const event of events) {
    const markets = Array.isArray(event?.markets) ? event.markets : [];
    for (const market of markets) {
      const eventTitle = event?.title || event?.name || "";
      const marketTitle = market?.question || market?.title || market?.name || "";
      const tags = collectTags(event, market);
      const entities = deriveEntities(eventTitle, marketTitle, tags);
      const outcomeDetails = normalizeOutcomes(market);
      const tokenIds = getTokenIds(market);
      const id = String(market?.id || market?.marketId || market?.slug || "");
      if (!id || !marketTitle) continue;

      normalized.push({
        eventId: String(event?.id || event?.eventId || ""),
        eventTitle,
        marketId: id,
        marketTitle,
        slug: market?.slug || market?.marketSlug || id,
        category: normalizeText(getCategory(event, market)),
        tags,
        sportOrLeague: normalizeText(getSportOrLeague(event, market) || ""),
        entities,
        startDate: normalizeDate(
          market?.startDate || event?.startDate || market?.startTime || event?.startTime,
        ),
        endDate: normalizeDate(
          market?.endDate || event?.endDate || market?.closeTime || event?.closeTime,
        ),
        resolutionDate: normalizeDate(
          market?.resolveDate || market?.resolutionDate || event?.resolutionDate,
        ),
        outcomes: outcomeDetails,
        outcomePrices: outcomeDetails
          .map((item) => item.price)
          .filter((price) => Number.isFinite(price)),
        liquidity:
          Number(market?.liquidityNum) ||
          Number(market?.liquidity) ||
          Number(event?.liquidity) ||
          null,
        volume:
          Number(market?.volumeNum) || Number(market?.volume) || Number(event?.volume) || null,
        active: Boolean(market?.active ?? event?.active ?? true),
        closed: Boolean(market?.closed ?? event?.closed ?? false),
        tokenIds,
        textTokens: tokenize(`${marketTitle} ${eventTitle} ${tags.join(" ")}`),
        searchBlob: normalizeText(`${marketTitle} ${eventTitle} ${tags.join(" ")} ${entities.join(" ")}`),
      });
    }
  }

  return normalized;
}
