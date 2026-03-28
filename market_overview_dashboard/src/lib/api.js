const GAMMA_BASE_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "/api/gamma"
    : "https://gamma-api.polymarket.com";

export async function fetchActiveMarkets(limit = 50) {
  const url = `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch active markets (${response.status})`);
  }

  return response.json();
}
