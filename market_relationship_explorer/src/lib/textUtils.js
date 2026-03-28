const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "will",
  "is",
  "are",
  "be",
  "and",
  "or",
  "from",
  "this",
  "that",
  "it",
  "as",
  "vs",
  "who",
  "what",
  "when",
  "where",
  "how",
  "if",
  "than",
  "then",
]);

export function toSafeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function makeSet(values = []) {
  return new Set(values.filter(Boolean).map((v) => normalizeText(v)));
}

export function intersectionSize(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let count = 0;
  for (const value of setA) {
    if (setB.has(value)) count += 1;
  }
  return count;
}

export function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (!setA.size || !setB.size) return 0;
  const intersection = intersectionSize(setA, setB);
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export function extractEntitiesFromText(text = "") {
  const raw = String(text).match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || [];
  return raw
    .map((entity) => entity.trim())
    .filter((entity) => entity.length >= 3);
}

export function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
