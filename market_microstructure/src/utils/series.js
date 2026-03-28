const PERCENT = 100;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizeProbability(raw) {
  const value = toNumber(raw, 0);
  return value > 1 ? value : value * PERCENT;
}

export function extractPriceHistoryRows(payload) {
  const candidates = payload?.history ?? payload?.data ?? payload?.prices ?? [];
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((entry) => {
      const timestamp = entry.t ?? entry.timestamp ?? entry.time ?? entry.date;
      const probability = normalizeProbability(entry.p ?? entry.price ?? entry.probability);
      const volume = toNumber(entry.v ?? entry.volume ?? entry.amount ?? 0, 0);
      const date = new Date(timestamp);

      return {
        timestamp: date.getTime(),
        timeLabel: date.toLocaleString(),
        probability,
        volume
      };
    })
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function enrichMicrostructureSeries(points, rollingWindow = 8) {
  return points.map((point, index, array) => {
    const previous = array[index - 1];
    const delta = previous ? point.probability - previous.probability : 0;
    const bucketHours = previous ? (point.timestamp - previous.timestamp) / (1000 * 60 * 60) : 1;
    const velocity = bucketHours > 0 ? delta / bucketHours : 0;

    const sliceStart = Math.max(0, index - rollingWindow + 1);
    const windowSlice = array.slice(sliceStart, index + 1).map((item) => item.probability);
    const mean = windowSlice.reduce((sum, item) => sum + item, 0) / windowSlice.length;
    const variance =
      windowSlice.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, windowSlice.length);
    const stdDev = Math.sqrt(variance);

    return {
      ...point,
      velocity,
      volatility: stdDev,
      upperBand: Math.min(100, point.probability + stdDev),
      lowerBand: Math.max(0, point.probability - stdDev),
      inflection: Math.abs(delta) > 5
    };
  });
}
