import { MIN_RELATION_SCORE } from "../constants";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "in",
  "to",
  "for",
  "of",
  "on",
  "will",
  "be",
  "is",
  "are",
  "by",
  "with",
  "at",
  "from",
]);

const GENERIC_TAGS = new Set([
  "news",
  "markets",
  "market",
  "prediction",
  "predictions",
  "politics",
  "sports",
  "crypto",
  "finance",
  "world",
  "misc",
  "general",
  "other",
  "usa",
  "us",
  "global",
  "breaking",
  "event",
  "events",
]);

const NOVELTY_KEYWORDS = [
  "alien",
  "ufo",
  "zombie",
  "time travel",
  "bigfoot",
  "paranormal",
  "ghost",
  "meme",
  "satire",
  "joke market",
  "fictional",
];

const ELECTION_KEYWORDS = [
  "election",
  "primary",
  "runoff",
  "senate",
  "house",
  "governor",
  "president",
  "presidential",
  "candidate",
];

const CONDITIONAL_KEYWORDS = [
  "if ",
  "assuming",
  "conditional on",
  "given ",
  "provided that",
];

const VARIABLE_KEYWORDS = [
  "inflation",
  "cpi",
  "gdp",
  "unemployment",
  "interest rate",
  "fed funds",
  "vote share",
  "margin",
  "turnout",
  "goals",
  "points",
  "spread",
  "revenue",
  "earnings",
  "price",
  "temperature",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  if (!text) return [];
  return normalizeText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token));
}

function jaccard(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / (a.size + b.size - overlap || 1);
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sharedItems(a, b) {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseMatchupEntities(text) {
  const normalized = normalizeText(text);
  const patterns = [
    /([a-z0-9 .'-]{2,50})\s(?:vs|v|at|@)\s([a-z0-9 .'-]{2,50})/g,
  ];
  const entities = [];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const left = normalizeText(match[1]);
      const right = normalizeText(match[2]);
      if (left && right) {
        entities.push(left, right);
      }
    }
  }
  return entities;
}

function parseOutcomeEntities(outcomes) {
  const normalizedOutcomes = toSafeArray(outcomes).map((outcome) => normalizeText(outcome));
  return normalizedOutcomes
    .filter(Boolean)
    .filter((outcome) => !["yes", "no", "other", "none"].includes(outcome))
    .filter((outcome) => outcome.split(" ").length <= 4);
}

function parseStructuredTags(market) {
  const rawTags = toSafeArray(market?.raw?.tags);
  const structuredTags = [];

  for (const tag of rawTags) {
    if (typeof tag === "string") continue;
    const value = normalizeText(tag?.slug || tag?.name || tag?.label || tag?.id || "");
    const type = normalizeText(tag?.type || tag?.category || tag?.group || tag?.parent || "");
    if (!value || GENERIC_TAGS.has(value)) continue;

    if (type) {
      structuredTags.push(`${type}:${value}`);
    }
    structuredTags.push(`value:${value}`);
  }

  return [...new Set(structuredTags)];
}

function parseUnderlyingVariables(text) {
  const normalized = normalizeText(text);
  return VARIABLE_KEYWORDS.filter((keyword) => normalized.includes(keyword));
}

function buildMarketContext(market) {
  const question = normalizeText(market.question);
  const eventTitle = normalizeText(market.eventTitle);
  const mergedText = `${question} ${eventTitle}`.trim();
  const normalizedTags = toSafeArray(market.tags)
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
  const nonGenericTags = normalizedTags.filter((tag) => !GENERIC_TAGS.has(tag));
  const outcomeEntities = parseOutcomeEntities(market.outcomes);
  const matchupEntities = parseMatchupEntities(`${market.question} ${market.eventTitle}`);

  const entitySet = new Set([
    ...outcomeEntities,
    ...matchupEntities,
    ...nonGenericTags.filter((tag) => tag.split(" ").length <= 4 && tag.length > 3),
  ]);

  const structuredTags = parseStructuredTags(market);
  const sportLeague = normalizeText(market.sport || market.league || "");
  const isElectionMarket =
    hasKeyword(mergedText, ELECTION_KEYWORDS) ||
    nonGenericTags.some((tag) => hasKeyword(tag, ELECTION_KEYWORDS));

  return {
    ...market,
    mergedText,
    tokens: tokenize(mergedText),
    entities: [...entitySet].filter((entity) => entity.split(" ").length <= 5),
    structuredTags,
    sportLeague,
    candidateSet: isElectionMarket
      ? [...entitySet].filter((entity) => entity.split(" ").length <= 3 && entity.length > 4)
      : [],
    variableSet: parseUnderlyingVariables(mergedText),
    isConditional: hasKeyword(mergedText, CONDITIONAL_KEYWORDS),
    isElectionMarket,
    isNovelty: hasKeyword(mergedText, NOVELTY_KEYWORDS),
    genericTagOverlapGuard: nonGenericTags,
  };
}

function relationshipScore(a, b) {
  let score = 0;
  const reasons = [];
  const strongBases = [];

  if ((a.isNovelty || b.isNovelty) && a.eventId !== b.eventId) {
    if (!(a.isNovelty && b.isNovelty)) {
      return { score: 0, reasons: [] };
    }
  }

  const sharedEntities = sharedItems(a.entities, b.entities);
  const sharedStructuredTags = sharedItems(a.structuredTags, b.structuredTags);
  const sharedVariables = sharedItems(a.variableSet, b.variableSet);
  const sharedCandidates = sharedItems(a.candidateSet, b.candidateSet);
  const sameEvent = a.eventId && b.eventId && a.eventId === b.eventId;
  const sameSportLeague = a.sportLeague && b.sportLeague && a.sportLeague === b.sportLeague;
  const sharedTeams = sameSportLeague ? sharedEntities.filter((value) => value.length > 3) : [];

  if (sameEvent) {
    strongBases.push("same event");
    score += 0.78;
  }
  if (sameSportLeague && sharedTeams.length > 0) {
    strongBases.push("same sport/league with shared teams");
    score += 0.68;
  }
  if (a.isElectionMarket && b.isElectionMarket && (sharedCandidates.length >= 2 || sameEvent)) {
    strongBases.push("same election race/candidate set");
    score += 0.7;
  }
  if (sharedEntities.length > 0) {
    strongBases.push("shared named entities");
    score += Math.min(0.66, 0.52 + sharedEntities.length * 0.06);
  }
  if (sharedVariables.length > 0 && sharedEntities.length > 0) {
    strongBases.push("same underlying variable");
    score += 0.62;
  }
  if (a.isConditional && b.isConditional && (sharedEntities.length > 0 || sharedCandidates.length > 0)) {
    strongBases.push("conditional markets on same outcome");
    score += 0.64;
  }
  if (sharedStructuredTags.length > 0) {
    strongBases.push("same structured tag category");
    score += Math.min(0.62, 0.5 + sharedStructuredTags.length * 0.06);
  }

  // A pair must have at least one strong structural basis to be considered related.
  if (!strongBases.length) {
    return { score: 0, reasons: [] };
  }

  if (a.category && b.category && a.category === b.category) {
    score += 0.06;
    reasons.push("same category");
  }
  if (sameSportLeague) {
    score += 0.04;
    reasons.push("same sport/league");
  }

  // Text similarity is supporting evidence only. It cannot create relationships on its own.
  const wordingSimilarity = jaccard(a.tokens, b.tokens);
  if (wordingSimilarity > 0.2) {
    score += Math.min(0.08, wordingSimilarity * 0.1);
    reasons.push("supporting wording similarity");
  }

  reasons.unshift(...strongBases);

  return {
    score: Math.min(1, score),
    reasons,
  };
}

export function buildRelationshipMap(markets) {
  const preparedMarkets = markets.map(buildMarketContext);
  const relationMap = new Map();
  for (const market of preparedMarkets) {
    relationMap.set(market.marketId, []);
  }

  for (let i = 0; i < preparedMarkets.length; i += 1) {
    for (let j = i + 1; j < preparedMarkets.length; j += 1) {
      const a = preparedMarkets[i];
      const b = preparedMarkets[j];
      const relation = relationshipScore(a, b);
      if (relation.score < MIN_RELATION_SCORE) continue;

      const aLinks = relationMap.get(a.marketId);
      const bLinks = relationMap.get(b.marketId);
      const linkA = { marketId: b.marketId, score: relation.score, reasons: relation.reasons };
      const linkB = { marketId: a.marketId, score: relation.score, reasons: relation.reasons };
      aLinks.push(linkA);
      bLinks.push(linkB);
    }
  }

  for (const [key, links] of relationMap.entries()) {
    links.sort((a, b) => b.score - a.score);
    relationMap.set(key, links.slice(0, 8));
  }

  return relationMap;
}
