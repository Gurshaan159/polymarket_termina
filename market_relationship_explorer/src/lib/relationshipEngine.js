import { intersectionSize, jaccardSimilarity, makeSet } from "./textUtils";

const WEIGHTS = {
  sameEvent: 30,
  category: 8,
  sport: 8,
  tags: 12,
  entities: 14,
  textSimilarity: 10,
  movement: 40,
};
const MIN_RELATED_MARKETS = 2;

function compareMovementSignals(signalA, signalB) {
  if (!signalA || !signalB) return null;
  const sameDirection = signalA.direction === signalB.direction ? 1 : 0;
  const deltaGap = Math.min(Math.abs(signalA.delta - signalB.delta), 1);
  const volatilityGap = Math.min(Math.abs(signalA.volatility - signalB.volatility), 1);
  const similarity = (sameDirection * 0.5 + (1 - deltaGap) * 0.3 + (1 - volatilityGap) * 0.2) * WEIGHTS.movement;
  if (similarity <= 0) return null;
  return {
    contribution: similarity,
    reason: `Similar recent movement (${signalA.direction} vs ${signalB.direction})`,
  };
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function buildFallbackEdge(sourceMarket, targetMarket) {
  if (!sourceMarket || !targetMarket) return null;
  let score = 0;
  const reasons = [];

  if (sourceMarket.category && sourceMarket.category === targetMarket.category) {
    score += 6;
    reasons.push({
      key: "fallback_category",
      contribution: 6,
      label: "Same category",
      detail: sourceMarket.category,
    });
  }

  if (
    sourceMarket.sportOrLeague &&
    targetMarket.sportOrLeague &&
    sourceMarket.sportOrLeague === targetMarket.sportOrLeague
  ) {
    score += 5;
    reasons.push({
      key: "fallback_sport",
      contribution: 5,
      label: "Same sport/league",
      detail: sourceMarket.sportOrLeague,
    });
  }

  const textSimilarity = jaccardSimilarity(sourceMarket.textTokens, targetMarket.textTokens);
  if (textSimilarity > 0) {
    const textContribution = Math.max(2, textSimilarity * 10);
    score += textContribution;
    reasons.push({
      key: "fallback_wording",
      contribution: rounded(textContribution),
      label: "Some wording overlap",
      detail: `${Math.max(1, Math.round(textSimilarity * 100))}% token overlap`,
    });
  }

  if (score <= 0) {
    score = 1;
    reasons.push({
      key: "fallback_nearby",
      contribution: 1,
      label: "Nearby candidate market",
      detail: "Shown so you can continue exploring.",
    });
  }

  return {
    sourceMarketId: sourceMarket.marketId,
    targetMarketId: targetMarket.marketId,
    score: rounded(score),
    reasons,
  };
}

export function scoreRelationship(sourceMarket, targetMarket, movementSignals = new Map()) {
  if (!sourceMarket || !targetMarket || sourceMarket.marketId === targetMarket.marketId) {
    return null;
  }

  let score = 0;
  const reasons = [];

  if (sourceMarket.eventId && sourceMarket.eventId === targetMarket.eventId) {
    score += WEIGHTS.sameEvent;
    reasons.push({
      key: "same_event",
      contribution: WEIGHTS.sameEvent,
      label: "Same event",
      detail: `${sourceMarket.eventTitle}`,
    });
  }

  if (sourceMarket.category && sourceMarket.category === targetMarket.category) {
    score += WEIGHTS.category;
    reasons.push({
      key: "category",
      contribution: WEIGHTS.category,
      label: "Same category",
      detail: sourceMarket.category,
    });
  }

  if (
    sourceMarket.sportOrLeague &&
    targetMarket.sportOrLeague &&
    sourceMarket.sportOrLeague === targetMarket.sportOrLeague
  ) {
    score += WEIGHTS.sport;
    reasons.push({
      key: "sport",
      contribution: WEIGHTS.sport,
      label: "Same sport/league",
      detail: sourceMarket.sportOrLeague,
    });
  }

  const tagsA = makeSet(sourceMarket.tags);
  const tagsB = makeSet(targetMarket.tags);
  const tagsOverlap = intersectionSize(tagsA, tagsB);
  if (tagsOverlap > 0) {
    const tagContribution = Math.min(tagsOverlap * 4, WEIGHTS.tags);
    score += tagContribution;
    reasons.push({
      key: "tags",
      contribution: rounded(tagContribution),
      label: "Shared tags",
      detail: `${tagsOverlap} overlapping tags`,
    });
  }

  const entitiesA = makeSet(sourceMarket.entities);
  const entitiesB = makeSet(targetMarket.entities);
  const entitiesOverlap = intersectionSize(entitiesA, entitiesB);
  if (entitiesOverlap > 0) {
    const entityContribution = Math.min(entitiesOverlap * 6, WEIGHTS.entities);
    score += entityContribution;
    reasons.push({
      key: "entities",
      contribution: rounded(entityContribution),
      label: "Shared entities",
      detail: `${entitiesOverlap} overlapping teams/candidates/entities`,
    });
  }

  const textSimilarity = jaccardSimilarity(sourceMarket.textTokens, targetMarket.textTokens);
  if (textSimilarity >= 0.08) {
    const textContribution = textSimilarity * WEIGHTS.textSimilarity;
    score += textContribution;
    reasons.push({
      key: "wording",
      contribution: rounded(textContribution),
      label: "Similar wording",
      detail: `${Math.round(textSimilarity * 100)}% token similarity`,
    });
  }

  const movement = compareMovementSignals(
    movementSignals.get(sourceMarket.marketId),
    movementSignals.get(targetMarket.marketId),
  );
  if (movement) {
    score += movement.contribution;
    reasons.push({
      key: "movement",
      contribution: rounded(movement.contribution),
      label: "Behavioral alignment",
      detail: movement.reason,
    });
  }

  const normalizedScore = Math.min(score, 100);
  if (normalizedScore <= 0) return null;

  return {
    sourceMarketId: sourceMarket.marketId,
    targetMarketId: targetMarket.marketId,
    score: rounded(normalizedScore),
    reasons: reasons.sort((a, b) => b.contribution - a.contribution),
  };
}

export function buildRelationshipGraph(markets, selectedMarketId, movementSignals, limit = 12) {
  const selectedId = String(selectedMarketId || "");
  const selected = markets.find((market) => String(market.marketId) === selectedId) || null;
  if (!selected) {
    return {
      center: null,
      nodes: [],
      edges: [],
    };
  }

  const targetEdgeCount = Math.min(
    Math.max(limit, MIN_RELATED_MARKETS),
    Math.max(markets.length - 1, 0),
  );

  const scoredEdges = markets
    .filter((market) => String(market.marketId) !== String(selected.marketId))
    .map((market) => scoreRelationship(selected, market, movementSignals))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const edgeByTarget = new Map(scoredEdges.map((edge) => [edge.targetMarketId, edge]));
  if (scoredEdges.length < targetEdgeCount) {
    const fallbackEdges = markets
      .filter((market) => String(market.marketId) !== String(selected.marketId))
      .filter((market) => !edgeByTarget.has(market.marketId))
      .map((market) => buildFallbackEdge(selected, market))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    for (const edge of fallbackEdges) {
      scoredEdges.push(edge);
      if (scoredEdges.length >= targetEdgeCount) break;
    }
  }

  const edges = scoredEdges.slice(0, targetEdgeCount);

  const nodes = [
    selected,
    ...edges
      .map((edge) => markets.find((market) => market.marketId === edge.targetMarketId))
      .filter(Boolean),
  ];

  return {
    center: selected,
    nodes,
    edges,
  };
}
