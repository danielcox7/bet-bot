/**
 * Service to interact with Betfair Netlify functions
 */

export const getGreyhoundRaces = async () => {
  const response = await fetch("/api/get-greyhound-races");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch races");
  }
  return response.json();
};

export const getMarketBook = async (marketId) => {
  const response = await fetch("/api/get-race-market-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch market data");
  }
  const data = await response.json();
  return data[0]; // listMarketBook returns an array; we want the first (and only) market
};
