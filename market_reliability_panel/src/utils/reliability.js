const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizePrice(rawPrice) {
  const value = toNumber(rawPrice, 0);
  return value > 1 ? value / 100 : value;
}

export function normalizeBookLevels(levels) {
  if (!Array.isArray(levels)) {
    return [];
  }

  return levels
    .map((level) => {
      if (Array.isArray(level)) {
        return { price: normalizePrice(level[0]), size: toNumber(level[1], 0) };
      }
      return {
        price: normalizePrice(level.price ?? level.p),
        size: toNumber(level.size ?? level.s, 0)
      };
    })
    .filter((level) => level.price > 0 && level.size > 0)
    .sort((a, b) => a.price - b.price);
}

export function computeSpread(bids, asks) {
  if (!bids.length || !asks.length) {
    return { bestBid: 0, bestAsk: 0, spread: 1 };
  }
  const bestBid = bids[bids.length - 1].price;
  const bestAsk = asks[0].price;
  return {
    bestBid,
    bestAsk,
    spread: Math.max(0, bestAsk - bestBid)
  };
}

export function computeDepthWithinFivePercent(midPrice, bids, asks) {
  if (!midPrice) {
    return 0;
  }

  const lowerBound = midPrice * 0.95;
  const upperBound = midPrice * 1.05;
  const bidDepth = bids
    .filter((level) => level.price >= lowerBound)
    .reduce((sum, level) => sum + level.price * level.size, 0);
  const askDepth = asks
    .filter((level) => level.price <= upperBound)
    .reduce((sum, level) => sum + level.price * level.size, 0);

  return bidDepth + askDepth;
}

export function estimateSlippageUsd(asks, targetNotional = 500) {
  let remaining = targetNotional;
  let spent = 0;
  let acquired = 0;

  for (const level of asks) {
    if (remaining <= 0) {
      break;
    }
    const levelNotional = level.price * level.size;
    const consumeNotional = Math.min(levelNotional, remaining);
    const consumedSize = consumeNotional / level.price;

    remaining -= consumeNotional;
    spent += consumeNotional;
    acquired += consumedSize;
  }

  if (acquired === 0) {
    return targetNotional;
  }

  const avgFillPrice = spent / acquired;
  const bestAsk = asks[0]?.price ?? avgFillPrice;
  return Math.max(0, (avgFillPrice - bestAsk) * targetNotional);
}

export function extractDailyVolumeSeries(payload) {
  const rows = payload?.history ?? payload?.data ?? payload?.prices ?? [];
  if (!Array.isArray(rows)) {
    return [];
  }

  const base = rows
    .map((row) => ({
      date: new Date(row.t ?? row.timestamp ?? row.time ?? row.date).toLocaleDateString(),
      volume: toNumber(row.v ?? row.volume ?? row.amount ?? 0, 0)
    }))
    .filter((point) => point.volume >= 0);

  return base.map((point, index, array) => {
    const sliceStart = Math.max(0, index - 6);
    const rollingWindow = array.slice(sliceStart, index + 1);
    const rollingVolume = rollingWindow.reduce((sum, item) => sum + item.volume, 0) / rollingWindow.length;

    return {
      ...point,
      rollingVolume
    };
  });
}

export function computeReliabilityScore({ depthUsd, spreadDecimal, rollingVolume }) {
  const depthScore = Math.min(100, (depthUsd / 10_000) * 100);
  const spreadScore = Math.max(0, 100 - spreadDecimal * 800);
  const volumeScore = Math.min(100, (rollingVolume / 50_000) * 100);

  const score = depthScore * 0.4 + spreadScore * 0.3 + volumeScore * 0.3;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function describeReliability(score, spread, depth, slippage) {
  if (score >= 70) {
    return "Healthy market - probability signal is likely reliable for moderate position sizing.";
  }
  if (score >= 40) {
    return "Mixed liquidity - probability can be informative but execution quality may vary.";
  }
  if (spread > 0.04 || depth < 1_000 || slippage > 20) {
    return "Thin market - treat this probability with caution due to weak depth and execution risk.";
  }
  return "Low-confidence market - monitor order book health before using this signal.";
}

export function scoreColorClass(score) {
  if (score >= 70) {
    return "score-green";
  }
  if (score >= 40) {
    return "score-yellow";
  }
  return "score-red";
}
