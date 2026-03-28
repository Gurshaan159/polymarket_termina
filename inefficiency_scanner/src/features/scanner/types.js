export const SIGNAL_TYPES = {
  FIELD_PROBABILITY_INCONSISTENCY: "field_probability_inconsistency",
  DELAYED_REACTION: "delayed_reaction",
  UNSUPPORTED_JUMP: "unsupported_jump",
  ABNORMAL_VOLATILITY: "abnormal_volatility",
  THIN_MARKET_INSTABILITY: "thin_market_instability",
  CROSS_MARKET_INCOHERENCE: "cross_market_incoherence",
};

export const TIME_HORIZONS = {
  "1h": { label: "1 hour", lookbackMs: 60 * 60 * 1000, interval: "1h", bucketMs: 2 * 60 * 1000 },
  "6h": { label: "6 hours", lookbackMs: 6 * 60 * 60 * 1000, interval: "6h", bucketMs: 10 * 60 * 1000 },
  "24h": { label: "24 hours", lookbackMs: 24 * 60 * 60 * 1000, interval: "1d", bucketMs: 30 * 60 * 1000 },
  "7d": { label: "7 days", lookbackMs: 7 * 24 * 60 * 60 * 1000, interval: "max", bucketMs: 3 * 60 * 60 * 1000 },
};

export const SIGNAL_META = {
  [SIGNAL_TYPES.FIELD_PROBABILITY_INCONSISTENCY]: {
    label: "Field Inconsistency",
    className: "badgeField",
  },
  [SIGNAL_TYPES.DELAYED_REACTION]: {
    label: "Delayed Reaction",
    className: "badgeDelayed",
  },
  [SIGNAL_TYPES.UNSUPPORTED_JUMP]: {
    label: "Unsupported Jump",
    className: "badgeUnsupported",
  },
  [SIGNAL_TYPES.ABNORMAL_VOLATILITY]: {
    label: "Abnormal Volatility",
    className: "badgeVolatility",
  },
  [SIGNAL_TYPES.THIN_MARKET_INSTABILITY]: {
    label: "Thin-Market Instability",
    className: "badgeThin",
  },
  [SIGNAL_TYPES.CROSS_MARKET_INCOHERENCE]: {
    label: "Cross-Market Incoherence",
    className: "badgeDivergence",
  },
};
