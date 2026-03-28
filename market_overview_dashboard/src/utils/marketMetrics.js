const PERCENT = 100;
const MS_IN_HOUR = 60 * 60 * 1000;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProbability = (value) => {
  const numeric = toNumber(value, 0);
  return numeric > 1 ? numeric / PERCENT : numeric;
};

const parseOutcomePrices = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

export function getCurrentProbability(market) {
  const direct = normalizeProbability(
    market.probability ?? market.lastPrice ?? market.last_price
  );
  if (direct > 0) {
    return direct;
  }

  const camelOutcomePrices = parseOutcomePrices(market.outcomePrices);
  if (camelOutcomePrices.length > 0) {
    return normalizeProbability(camelOutcomePrices[0]);
  }

  const snakeOutcomePrices = parseOutcomePrices(market.outcome_prices);
  if (snakeOutcomePrices.length > 0) {
    return normalizeProbability(snakeOutcomePrices[0]);
  }

  return 0;
}

export function get24hChange(market, probability = getCurrentProbability(market)) {
  if (market.oneDayPriceChange != null) {
    return normalizeProbability(market.oneDayPriceChange);
  }
  if (market.price_change_24h != null) {
    return normalizeProbability(market.price_change_24h);
  }
  if (market.one_day_price_change != null) {
    return normalizeProbability(market.one_day_price_change);
  }

  const previous = normalizeProbability(
    market.prevDayProbability ?? market.previous_probability ?? market.yesterdayProbability
  );
  return probability - previous;
}

export function getVolume24h(market) {
  return toNumber(
    market.volume24hr ?? market.volume24h ?? market.oneDayVolume ?? market.volume_24h ?? market.volume,
    0
  );
}

export function getOscillationScore(market, probability, change24h) {
  const high = normalizeProbability(market.high24h ?? market.high_24h ?? market.dayHigh);
  const low = normalizeProbability(market.low24h ?? market.low_24h ?? market.dayLow);

  if (high > 0 && low > 0 && high >= low) {
    return high - low;
  }

  return Math.abs(change24h) + probability * 0.02;
}

export function getTimeRemainingHours(market) {
  const rawEndDate = market.end_date_iso ?? market.endDate ?? market.end_date;
  if (!rawEndDate) {
    return Number.POSITIVE_INFINITY;
  }

  const endDate = new Date(rawEndDate).getTime();
  if (!Number.isFinite(endDate)) {
    return Number.POSITIVE_INFINITY;
  }

  return (endDate - Date.now()) / MS_IN_HOUR;
}

export function rankMarkets(markets) {
  const decorated = markets.map((market) => {
    const probability = getCurrentProbability(market);
    const change24h = get24hChange(market, probability);
    const volume24h = getVolume24h(market);
    const timeRemainingHours = getTimeRemainingHours(market);

    return {
      market,
      title: market.question ?? market.title ?? "Untitled market",
      probability,
      change24h,
      volume24h,
      timeRemainingHours,
      oscillation: getOscillationScore(market, probability, change24h)
    };
  });

  const topMovers = [...decorated]
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 8);

  const highestVolume = [...decorated].sort((a, b) => b.volume24h - a.volume24h).slice(0, 8);

  const volatilityLeaders = [...decorated].sort((a, b) => b.oscillation - a.oscillation).slice(0, 8);

  const resolvingSoon = [...decorated]
    .filter((item) => item.timeRemainingHours > 0 && item.timeRemainingHours <= 48)
    .sort((a, b) => a.timeRemainingHours - b.timeRemainingHours)
    .slice(0, 8);

  return { topMovers, highestVolume, volatilityLeaders, resolvingSoon };
}

export function formatSignedPercent(decimalDelta) {
  const sign = decimalDelta > 0 ? "+" : "";
  return `${sign}${(decimalDelta * PERCENT).toFixed(2)}%`;
}

export function formatProbability(decimalProbability) {
  return `${(decimalProbability * PERCENT).toFixed(2)}%`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatTimeRemaining(hours) {
  if (!Number.isFinite(hours)) {
    return "Unknown";
  }

  if (hours <= 0) {
    return "Resolving";
  }

  if (hours < 1) {
    return "<1h";
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  return `${(hours / 24).toFixed(1)}d`;
}
