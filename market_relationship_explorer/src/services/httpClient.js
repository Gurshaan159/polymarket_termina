function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error) {
  if (error?.name === "AbortError") {
    return new Error("Request timed out.");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unknown request error.");
}

async function parseErrorBody(response) {
  try {
    const text = await response.text();
    if (!text) return "";
    return text.slice(0, 240);
  } catch {
    return "";
  }
}

export async function fetchJsonWithRetry(
  url,
  { timeoutMs = 12000, retries = 2, retryDelayMs = 450 } = {},
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const bodySnippet = await parseErrorBody(response);
        const suffix = bodySnippet ? ` - ${bodySnippet}` : "";
        throw new Error(`Request failed: ${response.status} ${response.statusText}${suffix}`);
      }
      return await response.json();
    } catch (error) {
      lastError = normalizeError(error);
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw lastError;
      }
      await sleep(retryDelayMs * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Request failed.");
}
