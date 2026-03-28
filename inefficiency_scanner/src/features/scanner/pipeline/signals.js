import { SCANNER_GUARDRAILS } from "../constants";
import { SIGNAL_TYPES, TIME_HORIZONS } from "../types";

const RESULT_CLASSES = {
  ACTIONABLE: "actionable_signal",
  WATCHLIST: "watchlist_signal",
  INSUFFICIENT: "insufficient_data",
};

const RELATION_TIERS = {
  STRONG: "strong_structural",
  MEDIUM: "medium_structural",
  WEAK: "weak_semantic",
};

const WATCHLIST_LIMIT = 24;
const INSUFFICIENT_LIMIT = 12;
const ACTIONABLE_MIN_SEVERITY = 20;
const ACTIONABLE_MIN_CONFIDENCE = 20;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toPercent(value) {
  return Math.round(value * 100);
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance = avg(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timestampToMs(ts) {
  const value = new Date(ts).getTime();
  return Number.isFinite(value) ? value : null;
}

function bucketizeHistory(history, bucketMs, lookbackMs) {
  const now = Date.now();
  const startTs = now - lookbackMs;
  const sorted = history
    .map((point) => ({ ...point, ts: timestampToMs(point.timestamp) }))
    .filter((point) => point.ts !== null && point.ts >= startTs && point.ts <= now)
    .sort((a, b) => a.ts - b.ts);

  if (!sorted.length) return [];

  const firstBucket = Math.floor(startTs / bucketMs) * bucketMs;
  const finalBucket = Math.floor(now / bucketMs) * bucketMs;
  const buckets = [];
  let cursor = 0;
  let lastPrice = null;
  for (let bucket = firstBucket; bucket <= finalBucket; bucket += bucketMs) {
    while (cursor < sorted.length && sorted[cursor].ts <= bucket) {
      lastPrice = sorted[cursor].price;
      cursor += 1;
    }
    if (lastPrice === null) continue;
    buckets.push({
      ts: bucket,
      timestamp: new Date(bucket).toISOString(),
      price: lastPrice,
    });
  }
  return buckets;
}

function alignedPairSeries(aHistory, bHistory, horizon) {
  const cfg = TIME_HORIZONS[horizon];
  const a = bucketizeHistory(aHistory, cfg.bucketMs, cfg.lookbackMs);
  const b = bucketizeHistory(bHistory, cfg.bucketMs, cfg.lookbackMs);
  if (!a.length || !b.length) return [];

  const bByTs = new Map(b.map((point) => [point.ts, point.price]));
  return a
    .map((point) => {
      const other = bByTs.get(point.ts);
      if (other === undefined) return null;
      return {
        ts: point.ts,
        timestamp: point.timestamp,
        primary: point.price,
        related: other,
        absGap: Math.abs(point.price - other),
      };
    })
    .filter(Boolean);
}

function getCoverage(series, lookbackMs) {
  if (!series.length) return 0;
  const spanMs = Math.max(0, (series[series.length - 1].ts || 0) - (series[0].ts || 0));
  return clamp(spanMs / lookbackMs, 0, 1);
}

function hasEnoughHistory(series, horizon) {
  const cfg = TIME_HORIZONS[horizon];
  const targetPoints = Math.max(6, Math.floor(cfg.lookbackMs / cfg.bucketMs) + 1);
  const minPoints = Math.max(6, Math.floor(targetPoints * SCANNER_GUARDRAILS.dataSufficiency.minCoverageRatio));
  const minWatchlistPoints = Math.max(4, Math.floor(minPoints * 0.55));
  const coverage = getCoverage(series, cfg.lookbackMs);
  const distinct = new Set(series.map((item) => item.ts)).size;
  return {
    actionableOk:
      series.length >= minPoints &&
      coverage >= SCANNER_GUARDRAILS.dataSufficiency.minCoverageRatio &&
      distinct >= SCANNER_GUARDRAILS.dataSufficiency.minDistinctTimestamps,
    watchlistOk:
      series.length >= minWatchlistPoints &&
      coverage >= SCANNER_GUARDRAILS.dataSufficiency.minWatchlistCoverageRatio &&
      distinct >= SCANNER_GUARDRAILS.dataSufficiency.minWatchlistDistinctTimestamps,
    coverage,
  };
}

function hasEnoughAlignedPoints(aligned, horizon) {
  const coverage = getCoverage(aligned, TIME_HORIZONS[horizon].lookbackMs);
  return {
    actionableOk:
      aligned.length >= SCANNER_GUARDRAILS.dataSufficiency.minAlignedPoints &&
      coverage >= SCANNER_GUARDRAILS.dataSufficiency.minAlignedCoverageRatio,
    watchlistOk:
      aligned.length >= SCANNER_GUARDRAILS.dataSufficiency.minWatchlistAlignedPoints &&
      coverage >= SCANNER_GUARDRAILS.dataSufficiency.minWatchlistAlignedCoverageRatio,
    coverage,
  };
}

function computeReturns(series) {
  const values = [];
  for (let i = 1; i < series.length; i += 1) {
    values.push(series[i].price - series[i - 1].price);
  }
  return values;
}

function movement(series, min = SCANNER_GUARDRAILS.movement.minAbsoluteMove) {
  if (series.length < 2) return { ok: false, totalMove: 0 };
  const totalMove = Math.abs(series[series.length - 1].price - series[0].price);
  return { ok: totalMove >= min, totalMove };
}

function classifyRelationshipTier(link) {
  const reasons = (link?.reasons || "").join ? link.reasons.join(" ").toLowerCase() : String(link?.reasons || "").toLowerCase();
  const score = link?.score || 0;
  const strongBasis =
    reasons.includes("same event") ||
    reasons.includes("same sport/league with shared teams") ||
    reasons.includes("same election race/candidate set") ||
    reasons.includes("same underlying variable");
  if (strongBasis && score >= 0.7) return RELATION_TIERS.STRONG;
  const mediumBasis =
    strongBasis ||
    reasons.includes("conditional markets on same outcome") ||
    reasons.includes("same structured tag category");
  if (mediumBasis && score >= 0.55) return RELATION_TIERS.MEDIUM;
  return RELATION_TIERS.WEAK;
}

function liquidityQuality(market, micro = null) {
  const liquidity = market.liquidity || 0;
  const volume = market.volume || 0;
  const spread = micro?.spread ?? null;
  const depth = micro?.depth ?? 0;
  const liquidityNorm = clamp(Math.log10(liquidity + 1) / 4, 0, 1);
  const volumeNorm = clamp(Math.log10(volume + 1) / 4, 0, 1);
  const depthNorm = clamp(Math.log10(depth + 1) / 3.5, 0, 1);
  const spreadPenalty = spread === null ? 0.2 : clamp(spread / 0.12, 0, 1);
  return clamp(liquidityNorm * 0.4 + volumeNorm * 0.35 + depthNorm * 0.25 - spreadPenalty * 0.2, 0, 1);
}

function confidence({ relation = 0, coverage = 0, liquidity = 0, persistence = 0, evidence = 0, penalties = [], resultClass = RESULT_CLASSES.WATCHLIST }) {
  const raw = 16 + relation * 15 + coverage * 20 + liquidity * 10 + persistence * 10 + evidence * 35 - penalties.reduce((sum, p) => sum + p, 0);
  const score = clamp(Math.round(raw), 5, 94);
  if (resultClass === RESULT_CLASSES.WATCHLIST) return Math.min(score, 68);
  if (resultClass === RESULT_CLASSES.INSUFFICIENT) return Math.min(score, 38);
  return score;
}

function severity({ magnitude = 0, persistence = 0, moveSize = 0, volRatio = 0, spreadPenalty = 0 }) {
  const raw = magnitude * 48 + persistence * 20 + moveSize * 20 + Math.min(1.5, volRatio / 2.8) * 12 - spreadPenalty * 8;
  return clamp(Math.round(raw), 1, 100);
}

function evidenceQuality(resultClass, confidenceScore) {
  if (resultClass === RESULT_CLASSES.INSUFFICIENT) return "Insufficient data";
  if (confidenceScore >= 75) return "High evidence";
  if (confidenceScore >= 55) return "Moderate evidence";
  return "Low evidence";
}

function parseWinnerTemplate(question) {
  const text = String(question || "").toLowerCase().trim();
  const match = text.match(/^will\s+(.+?)\s+win\s+(.+)$/);
  if (!match) return null;
  return { subject: match[1].trim(), target: match[2].trim() };
}

function isMutuallyExclusiveWinnerPair(aMarket, bMarket) {
  const a = parseWinnerTemplate(aMarket.question);
  const b = parseWinnerTemplate(bMarket.question);
  if (!a || !b) return false;
  return a.target === b.target && String(aMarket.eventId || "") === String(bMarket.eventId || "") && a.subject !== b.subject;
}

function buildResult({ signalType, primaryMarket, comparisonMarkets = [], severityScore, confidenceScore, title, explanation, summary, metrics, chartData, signalClass, resultClass, relationshipTier = null }) {
  const normalizedClass =
    resultClass === RESULT_CLASSES.ACTIONABLE &&
    (severityScore < ACTIONABLE_MIN_SEVERITY || confidenceScore < ACTIONABLE_MIN_CONFIDENCE)
      ? RESULT_CLASSES.WATCHLIST
      : resultClass;
  return {
    id: `${signalType}:${primaryMarket.marketId}:${comparisonMarkets.map((m) => m.marketId).join("-") || "solo"}`,
    primaryMarketId: primaryMarket.marketId,
    comparisonMarketIds: comparisonMarkets.map((m) => m.marketId),
    signalType,
    signalClass,
    resultClass: normalizedClass,
    relationshipTier,
    evidenceQuality: evidenceQuality(normalizedClass, confidenceScore),
    severityScore,
    confidenceScore,
    title,
    explanation,
    behaviorSummary: summary,
    metrics,
    timestamp: new Date().toISOString(),
    supportingChartData: chartData,
    actionable: normalizedClass === RESULT_CLASSES.ACTIONABLE,
  };
}

function detectFieldSignals({ markets, bucketedById, microByMarketId, horizon }) {
  const groups = new Map();
  for (const market of markets) {
    const parsed = parseWinnerTemplate(market.question);
    if (!parsed) continue;
    const key = `${market.eventId || market.eventTitle || "unknown"}:${parsed.target}`;
    const items = groups.get(key) || [];
    items.push(market);
    groups.set(key, items);
  }

  const results = [];
  const lookbackPoints = Math.max(8, Math.floor(TIME_HORIZONS[horizon].lookbackMs / TIME_HORIZONS[horizon].bucketMs) + 1);
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const candidates = group.map((market) => ({ market, series: bucketedById.get(market.marketId) || [] })).filter((item) => item.series.length >= 4);
    if (candidates.length < 3) continue;

    const tsSet = new Set();
    candidates.forEach((item) => item.series.forEach((point) => tsSet.add(point.ts)));
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);
    if (timestamps.length < 4) continue;

    const maps = new Map(candidates.map((item) => [item.market.marketId, new Map(item.series.map((point) => [point.ts, point.price]))]));
    const totalSeries = timestamps
      .map((ts) => {
        let total = 0;
        let count = 0;
        for (const item of candidates) {
          const value = maps.get(item.market.marketId)?.get(ts);
          if (value === undefined) continue;
          total += value;
          count += 1;
        }
        if (count < Math.max(3, Math.floor(candidates.length * 0.7))) return null;
        return { ts, timestamp: new Date(ts).toISOString(), total };
      })
      .filter(Boolean);
    if (totalSeries.length < 4) continue;

    const totals = totalSeries.map((point) => point.total);
    const latestTotal = totals[totals.length - 1];
    const meanTotal = avg(totals);
    const overRatio = totals.filter((value) => value > 1.03).length / totals.length;
    const underRatio = totals.filter((value) => value < 0.72).length / totals.length;
    const moves = candidates
      .map((item) => ({ market: item.market, move: Math.abs(item.series[item.series.length - 1].price - item.series[0].price) }))
      .sort((a, b) => b.move - a.move);
    const leaderMove = moves[0]?.move || 0;
    const medianPeerMove = median(moves.slice(1).map((item) => item.move));
    const lagShape = leaderMove >= 0.06 && medianPeerMove <= Math.max(0.012, leaderMove * 0.3);
    const top4Mass = candidates.map((item) => item.series[item.series.length - 1].price).sort((a, b) => b - a).slice(0, 4).reduce((sum, value) => sum + value, 0);

    let mode = "";
    if (latestTotal > 1.08 && overRatio >= 0.5) mode = "overfull";
    else if (latestTotal > 1.03 && overRatio >= 0.35) mode = "watch_overfull";
    else if (latestTotal < 0.72 && underRatio >= 0.5 && candidates.length >= 6 && top4Mass > 0.64) mode = "underfull";
    else if (lagShape) mode = "lagged_field";
    if (!mode) continue;

    const primary = moves[0]?.market || candidates[0].market;
    const liquidity = liquidityQuality(primary, microByMarketId.get(primary.marketId));
    const coverage = clamp(totalSeries.length / lookbackPoints, 0, 1);
    const actionable =
      (mode === "overfull" || mode === "underfull" || mode === "watch_overfull") &&
      coverage >= 0.45 &&
      liquidity >= 0.16;
    const resultClass = actionable ? RESULT_CLASSES.ACTIONABLE : RESULT_CLASSES.WATCHLIST;
    const penalties = [];
    if (coverage < 0.5) penalties.push(SCANNER_GUARDRAILS.confidence.penaltySparseHistory);
    if (liquidity < SCANNER_GUARDRAILS.confidence.thinLiquidityThreshold) penalties.push(SCANNER_GUARDRAILS.confidence.penaltyThinLiquidity);

    const inconsistencyMagnitude = mode === "underfull" ? Math.abs(0.85 - latestTotal) : Math.abs(latestTotal - 1);
    const persistenceRatio = mode.includes("overfull") ? overRatio : mode === "underfull" ? underRatio : 0.5;
    const severityScore = severity({
      magnitude: clamp(inconsistencyMagnitude / 0.25, 0, 1.4),
      persistence: persistenceRatio,
      moveSize: clamp(leaderMove / 0.12, 0, 1),
      spreadPenalty: 1 - liquidity,
    });
    const confidenceScore = confidence({
      relation: 0.95,
      coverage,
      liquidity,
      persistence: persistenceRatio,
      evidence: clamp(inconsistencyMagnitude / 0.14, 0, 1.2),
      penalties,
      resultClass,
    });

    const explanationByMode = {
      overfull: `Summed probabilities for mutually exclusive outcomes reached ${toPercent(latestTotal)}% and stayed above 103% for ${Math.round(overRatio * 100)}% of aligned observations.`,
      watch_overfull: `Field total reached ${toPercent(latestTotal)}% with sustained mild overround pressure (${Math.round(overRatio * 100)}% persistence).`,
      underfull: `Field total dropped to ${toPercent(latestTotal)}% despite broad field coverage, indicating underround incoherence.`,
      lagged_field: `One outcome moved ${toPercent(leaderMove)} points while peer outcomes moved only ${toPercent(medianPeerMove)} points median, leaving field structure out of balance.`,
    };

    const summaryByMode = {
      overfull: "The summed probability of mutually exclusive outcomes remained materially above 100%, indicating a field-level pricing inconsistency.",
      watch_overfull: "Watchlist-level evidence: field total is modestly above a coherent range and is being monitored for sustained structural pressure.",
      underfull: "The field appears underpriced relative to expected outcome coverage, indicating potential structural incoherence.",
      lagged_field: "Watchlist-level evidence: a leader outcome repriced without proportional adjustment elsewhere in the field.",
    };

    results.push(
      buildResult({
        signalType: SIGNAL_TYPES.FIELD_PROBABILITY_INCONSISTENCY,
        primaryMarket: primary,
        comparisonMarkets: candidates.slice(1, 6).map((item) => item.market),
        severityScore,
        confidenceScore,
        title: "Field probability structure appears incoherent",
        explanation: explanationByMode[mode],
        summary: summaryByMode[mode],
        metrics: {
          fieldSize: candidates.length,
          latestFieldTotal: latestTotal,
          meanFieldTotal: meanTotal,
          persistenceRatio,
          leaderMove,
          medianPeerMove,
          alignedCoverage: coverage,
          relationshipTier: RELATION_TIERS.STRONG,
          liquidityQuality: liquidity,
        },
        chartData: totalSeries.map((point) => ({ timestamp: point.timestamp, primary: point.total })),
        signalClass: "structural",
        resultClass,
        relationshipTier: RELATION_TIERS.STRONG,
      }),
    );
  }
  return results;
}

function detectDelayedRepricing({ market, links, rawSeriesById, marketById, liquidity, horizon }) {
  const results = [];
  const primaryRaw = rawSeriesById.get(market.marketId) || [];
  for (const link of links.slice(0, 6)) {
    const relatedMarket = marketById.get(link.marketId);
    if (!relatedMarket) continue;
    const tier = classifyRelationshipTier(link);
    if (tier === RELATION_TIERS.WEAK) continue;
    if (tier === RELATION_TIERS.MEDIUM && (link.score || 0) < 0.72) continue;
    if (isMutuallyExclusiveWinnerPair(market, relatedMarket)) continue;

    const relatedRaw = rawSeriesById.get(link.marketId) || [];
    if (!relatedRaw.length) continue;
    const aligned = alignedPairSeries(primaryRaw, relatedRaw, horizon);
    const alignedCheck = hasEnoughAlignedPoints(aligned, horizon);
    if (!alignedCheck.watchlistOk) continue;

    const split = Math.floor(aligned.length * 0.66);
    if (split < 4 || split >= aligned.length - 1) continue;
    const relatedEarlyMove = Math.abs(aligned[split].related - aligned[0].related);
    const primaryEarlyMove = Math.abs(aligned[split].primary - aligned[0].primary);
    const primaryTotalMove = Math.abs(aligned[aligned.length - 1].primary - aligned[0].primary);
    const latestGap = aligned[aligned.length - 1].absGap;
    if (relatedEarlyMove < 0.04 || primaryEarlyMove > relatedEarlyMove * 0.6 || primaryTotalMove > relatedEarlyMove) continue;

    const actionable =
      tier !== RELATION_TIERS.WEAK &&
      (link.score || 0) >= 0.6 &&
      alignedCheck.watchlistOk &&
      relatedEarlyMove >= 0.05 &&
      primaryEarlyMove <= 0.04;
    const resultClass = actionable ? RESULT_CLASSES.ACTIONABLE : RESULT_CLASSES.WATCHLIST;
    const penalties = [];
    if (!alignedCheck.actionableOk) penalties.push(SCANNER_GUARDRAILS.confidence.penaltyLowAlignedCoverage);
    if (tier !== RELATION_TIERS.STRONG) penalties.push(SCANNER_GUARDRAILS.confidence.penaltyWeakRelationship);
    if (liquidity < SCANNER_GUARDRAILS.confidence.thinLiquidityThreshold) penalties.push(SCANNER_GUARDRAILS.confidence.penaltyThinLiquidity);

    const lagMagnitude = clamp((relatedEarlyMove - primaryEarlyMove) / 0.12, 0, 1.35);
    const severityScore = severity({
      magnitude: lagMagnitude,
      persistence: 0.6,
      moveSize: clamp(relatedEarlyMove / 0.14, 0, 1),
      spreadPenalty: 1 - liquidity,
    });
    const confidenceScore = confidence({
      relation: tier === RELATION_TIERS.STRONG ? clamp(link.score || 0, 0, 1) : clamp((link.score || 0) * 0.75, 0, 1),
      coverage: alignedCheck.coverage,
      liquidity,
      persistence: 0.55,
      evidence: lagMagnitude,
      penalties,
      resultClass,
    });

    results.push(
      buildResult({
        signalType: SIGNAL_TYPES.DELAYED_REACTION,
        primaryMarket: market,
        comparisonMarkets: [relatedMarket],
        severityScore,
        confidenceScore,
        title: "Market appears to be lagging related repricing",
        explanation: `"${relatedMarket.question}" moved ${toPercent(relatedEarlyMove)} points while this market moved only ${toPercent(primaryEarlyMove)} points during the same early window.`,
        summary:
          resultClass === RESULT_CLASSES.WATCHLIST
            ? "Watchlist-level evidence: this market lags a structurally related repricing move, but supporting coverage is moderate."
            : "This market has not fully repriced despite a material move in a strongly related contract.",
        metrics: {
          relatedMove: relatedEarlyMove,
          primaryMove: primaryEarlyMove,
          primaryTotalMove,
          latestGap,
          alignedCoverage: alignedCheck.coverage,
          alignedPoints: aligned.length,
          relationshipTier: tier,
          liquidityQuality: liquidity,
        },
        chartData: aligned,
        signalClass: "behavioral",
        resultClass,
        relationshipTier: tier,
      }),
    );
  }
  return results;
}

function detectUnsupportedJump({ market, links, rawSeriesById, marketById, micro, liquidity, horizon }) {
  const raw = rawSeriesById.get(market.marketId) || [];
  const series = bucketizeHistory(raw, TIME_HORIZONS[horizon].bucketMs, TIME_HORIZONS[horizon].lookbackMs);
  const history = hasEnoughHistory(series, horizon);
  if (series.length < 4 || !history.watchlistOk) return null;

  let jump = 0;
  let jumpIndex = -1;
  for (let i = 1; i < series.length; i += 1) {
    const value = Math.abs(series[i].price - series[i - 1].price);
    if (value > jump) {
      jump = value;
      jumpIndex = i;
    }
  }
  if (jumpIndex < 0 || jump < 0.025) return null;

  const jumpTs = series[jumpIndex].ts;
  const confirmations = [];
  for (const link of links.slice(0, 6)) {
    if (classifyRelationshipTier(link) !== RELATION_TIERS.STRONG) continue;
    if (!marketById.get(link.marketId)) continue;
    const aligned = alignedPairSeries(raw, rawSeriesById.get(link.marketId) || [], horizon);
    const idx = aligned.findIndex((point) => point.ts >= jumpTs);
    if (idx <= 0) continue;
    confirmations.push(Math.abs(aligned[idx].related - aligned[idx - 1].related));
  }
  const relatedMove = avg(confirmations);
  const unsupportedMagnitude = Math.max(0, jump - relatedMove);
  if (unsupportedMagnitude < 0.015) return null;

  const actionable = jump >= 0.06 && unsupportedMagnitude >= 0.03 && liquidity <= 0.65;
  const resultClass = actionable ? RESULT_CLASSES.ACTIONABLE : RESULT_CLASSES.WATCHLIST;
  const severityScore = severity({
    magnitude: clamp(unsupportedMagnitude / 0.12, 0, 1.4),
    persistence: 0.35,
    moveSize: clamp(jump / 0.15, 0, 1),
    spreadPenalty: 1 - liquidity,
  });
  const confidenceScore = confidence({
    relation: confirmations.length ? 0.75 : 0.5,
    coverage: history.coverage,
    liquidity,
    persistence: 0.3,
    evidence: clamp(unsupportedMagnitude / 0.06, 0, 1.2),
    penalties: liquidity < SCANNER_GUARDRAILS.confidence.thinLiquidityThreshold ? [SCANNER_GUARDRAILS.confidence.penaltyThinLiquidity] : [],
    resultClass,
  });

  return buildResult({
    signalType: SIGNAL_TYPES.UNSUPPORTED_JUMP,
    primaryMarket: market,
    comparisonMarkets: [],
    severityScore,
    confidenceScore,
    title: "Large jump lacks supporting structural confirmation",
    explanation: `Price jumped ${toPercent(jump)} points while structurally related confirmation averaged ${toPercent(relatedMove || 0)} points.`,
    summary:
      resultClass === RESULT_CLASSES.WATCHLIST
        ? "Watchlist-level evidence: jump size is notable, but confirmation context is not strong enough for a high-conviction alert."
        : "A large jump appeared without comparable movement in structurally related markets.",
    metrics: {
      jumpSize: jump,
      relatedConfirmationMove: relatedMove,
      alignedConfirmations: confirmations.length,
      historyCoverage: history.coverage,
      liquidityQuality: liquidity,
      spreadEstimate: micro?.spread ?? 0.08,
    },
    chartData: series.map((point) => ({ timestamp: point.timestamp, primary: point.price })),
    signalClass: "behavioral",
    resultClass,
  });
}

function detectAbnormalVolatility({ market, series, liquidity, horizon }) {
  const history = hasEnoughHistory(series, horizon);
  if (!history.watchlistOk || series.length < 6) return null;
  const returns = computeReturns(series);
  if (returns.length < 4) return null;

  const split = Math.max(4, Math.floor(returns.length * 0.65));
  const baseline = returns.slice(0, split);
  const recent = returns.slice(split);
  const baselineStd = stdDev(baseline);
  const recentStd = stdDev(recent);
  const totalMove = Math.abs(series[series.length - 1].price - series[0].price);
  const epsilon = SCANNER_GUARDRAILS.volatility.epsilonStd;
  if (baselineStd < epsilon && recentStd < epsilon) return null;
  if (totalMove < SCANNER_GUARDRAILS.volatility.minMeaningfulMove) return null;

  const ratio = baselineStd < epsilon ? null : recentStd / baselineStd;
  const elevated =
    (ratio !== null && ratio >= SCANNER_GUARDRAILS.volatility.minWatchlistRatio) ||
    (ratio === null && recentStd >= SCANNER_GUARDRAILS.volatility.minRecentStd);
  if (!elevated) return null;

  const actionable =
    history.watchlistOk &&
    totalMove >= SCANNER_GUARDRAILS.movement.minMeaningfulSeriesMove &&
    ((ratio !== null && ratio >= SCANNER_GUARDRAILS.volatility.minActionableRatio) ||
      (ratio === null && recentStd >= SCANNER_GUARDRAILS.volatility.minRecentStd * 1.3));
  const resultClass = actionable ? RESULT_CLASSES.ACTIONABLE : RESULT_CLASSES.WATCHLIST;
  const severityScore = severity({
    magnitude: clamp(((ratio || 1.2) - 1) / 1.2, 0, 1.25),
    persistence: clamp(recent.length / returns.length, 0, 1),
    moveSize: clamp(totalMove / 0.1, 0, 1),
    volRatio: ratio || recentStd / Math.max(epsilon, baselineStd || epsilon),
    spreadPenalty: 1 - liquidity,
  });
  const confidenceScore = confidence({
    relation: 0.25,
    coverage: history.coverage,
    liquidity,
    persistence: 0.5,
    evidence: clamp((recentStd - baselineStd) / 0.012 + totalMove / 0.07, 0, 1.2),
    penalties: baselineStd < epsilon ? [10] : [],
    resultClass,
  });

  return buildResult({
    signalType: SIGNAL_TYPES.ABNORMAL_VOLATILITY,
    primaryMarket: market,
    comparisonMarkets: [],
    severityScore,
    confidenceScore,
    title: "Recent volatility is materially above baseline",
    explanation:
      ratio === null
        ? `Baseline variance was near zero, while recent realized volatility rose to ${recentStd.toFixed(4)}; confidence is reduced due to near-zero baseline context.`
        : `Recent volatility is ${ratio.toFixed(2)}x baseline with ${toPercent(totalMove)} points of absolute movement.`,
    summary:
      resultClass === RESULT_CLASSES.WATCHLIST
        ? "Watchlist-level evidence: volatility has increased, but baseline support or market context is still moderate."
        : "Recent movement is materially more volatile than baseline with enough data support to treat as a credible regime change.",
    metrics: {
      volatilityRatio: ratio || 0,
      baselineStd,
      recentStd,
      totalMove,
      historyCoverage: history.coverage,
      liquidityQuality: liquidity,
    },
    chartData: series.map((point, index) => ({
      timestamp: point.timestamp,
      primary: point.price,
      rollingVolatility: index > 0 ? Math.abs(point.price - series[index - 1].price) : 0,
    })),
    signalClass: "behavioral",
    resultClass,
  });
}

function detectThinMarketInstability({ market, series, micro, liquidity, horizon }) {
  const history = hasEnoughHistory(series, horizon);
  const move = movement(series, SCANNER_GUARDRAILS.movement.minMeaningfulSeriesMove);
  if (!history.watchlistOk || !move.ok) return null;

  const spread = micro?.spread ?? null;
  const depth = micro?.depth ?? 0;
  const veryThin =
    liquidity < 0.26 || (spread !== null && spread > 0.08) || depth < 320;
  if (!veryThin) return null;

  const actionable =
    move.totalMove >= 0.035 &&
    (depth < 280 || spread > 0.085 || liquidity < 0.26) &&
    history.watchlistOk;
  const resultClass = actionable ? RESULT_CLASSES.ACTIONABLE : RESULT_CLASSES.WATCHLIST;
  const severityScore = severity({
    magnitude: clamp(move.totalMove / 0.12, 0, 1.2),
    persistence: 0.4,
    moveSize: clamp(move.totalMove / 0.11, 0, 1),
    spreadPenalty: clamp((spread || 0.08) / 0.13, 0, 1),
  });
  const confidenceScore = confidence({
    relation: 0.2,
    coverage: history.coverage,
    liquidity,
    persistence: 0.35,
    evidence: clamp(move.totalMove / 0.08, 0, 1),
    penalties: [SCANNER_GUARDRAILS.confidence.penaltyThinLiquidity],
    resultClass,
  });

  return buildResult({
    signalType: SIGNAL_TYPES.THIN_MARKET_INSTABILITY,
    primaryMarket: market,
    comparisonMarkets: [],
    severityScore,
    confidenceScore,
    title: "Large move occurred under thin-market conditions",
    explanation: `Price moved ${toPercent(move.totalMove)} points while spread/depth conditions remained weak.`,
    summary:
      resultClass === RESULT_CLASSES.WATCHLIST
        ? "Watchlist-level evidence: movement is notable, but thin market quality lowers reliability of price discovery."
        : "Price moved sharply despite weak depth and wide spreads, suggesting unstable market-quality-driven movement.",
    metrics: {
      totalMove: move.totalMove,
      spreadEstimate: spread ?? 0.1,
      depthEstimate: depth,
      historyCoverage: history.coverage,
      liquidityQuality: liquidity,
    },
    chartData: series.map((point) => ({ timestamp: point.timestamp, primary: point.price })),
    signalClass: "liquidity",
    resultClass,
  });
}

function dedupeAndRank(results) {
  const deduped = new Map();
  for (const result of results) {
    const comparisonId = result.comparisonMarketIds[0] || "solo";
    const key =
      comparisonId !== "solo"
        ? `${result.signalType}:${[result.primaryMarketId, comparisonId].sort().join(":")}`
        : `${result.signalType}:${result.primaryMarketId}:solo`;
    const existing = deduped.get(key);
    if (
      !existing ||
      result.severityScore > existing.severityScore ||
      (result.severityScore === existing.severityScore && result.confidenceScore > existing.confidenceScore)
    ) {
      deduped.set(key, result);
    }
  }

  const ranked = Array.from(deduped.values()).sort((a, b) => {
    const classWeight = {
      [RESULT_CLASSES.ACTIONABLE]: 3,
      [RESULT_CLASSES.WATCHLIST]: 2,
      [RESULT_CLASSES.INSUFFICIENT]: 1,
    };
    const classDiff = (classWeight[b.resultClass] || 0) - (classWeight[a.resultClass] || 0);
    if (classDiff) return classDiff;
    return b.severityScore - a.severityScore || b.confidenceScore - a.confidenceScore;
  });

  const actionable = ranked.filter((item) => item.resultClass === RESULT_CLASSES.ACTIONABLE);
  const watchlist = ranked.filter((item) => item.resultClass === RESULT_CLASSES.WATCHLIST).slice(0, WATCHLIST_LIMIT);
  const insufficient = ranked.filter((item) => item.resultClass === RESULT_CLASSES.INSUFFICIENT).slice(0, INSUFFICIENT_LIMIT);
  return [...actionable, ...watchlist, ...insufficient];
}

export function computeScannerSignals({
  markets,
  relationshipMap,
  marketTimeSeries,
  microByMarketId,
  horizon,
}) {
  const marketById = new Map(markets.map((market) => [market.marketId, market]));
  const rawSeriesById = new Map(marketTimeSeries.map((item) => [item.marketId, item.history]));
  const cfg = TIME_HORIZONS[horizon];
  const bucketedById = new Map(
    marketTimeSeries.map((item) => [item.marketId, bucketizeHistory(item.history || [], cfg.bucketMs, cfg.lookbackMs)]),
  );

  const results = [];
  results.push(...detectFieldSignals({ markets, bucketedById, microByMarketId, horizon }));

  for (const market of markets) {
    const series = bucketedById.get(market.marketId) || [];
    if (series.length < 2) continue;
    const liquidity = liquidityQuality(market, microByMarketId.get(market.marketId));
    const links = relationshipMap.get(market.marketId) || [];

    results.push(
      ...detectDelayedRepricing({
        market,
        links,
        rawSeriesById,
        marketById,
        liquidity,
        horizon,
      }),
    );

    const unsupported = detectUnsupportedJump({
      market,
      links,
      rawSeriesById,
      marketById,
      micro: microByMarketId.get(market.marketId),
      liquidity,
      horizon,
    });
    if (unsupported) results.push(unsupported);

    const volatility = detectAbnormalVolatility({
      market,
      series,
      liquidity,
      horizon,
    });
    if (volatility) results.push(volatility);

    const thin = detectThinMarketInstability({
      market,
      series,
      micro: microByMarketId.get(market.marketId),
      liquidity,
      horizon,
    });
    if (thin) results.push(thin);
  }

  return dedupeAndRank(results);
}
