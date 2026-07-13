import { getBetfairSession, invalidateSession } from "./betfair-auth.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed. Only POST requests are accepted." }),
    };
  }

  let marketId;
  try {
    const body = JSON.parse(event.body);
    marketId = body.marketId;
  } catch (parseError) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body provided." }),
    };
  }

  if (!marketId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing marketId in request body." }),
    };
  }

  let sessionToken, appKey;
  try {
    ({ sessionToken, appKey } = await getBetfairSession());
  } catch (authError) {
    console.error("Betfair authentication failed:", authError.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Authentication failed: ${authError.message}` }),
    };
  }

  try {
    const response = await fetch(
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/",
      {
        method: "POST",
        headers: {
          "X-Application": appKey,
          "X-Authentication": sessionToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketIds: [marketId],
          priceProjection: { priceData: ["EX_BEST_OFFERS", "EX_TRADED"] },
        }),
      }
    );

    // If Betfair says the token is invalid, clear cache so next call re-logs in
    if (response.status === 401 || response.status === 403) {
      invalidateSession();
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Betfair listMarketBook failed for ${marketId}:`, errorText);
      throw new Error(`Betfair API responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error("Error fetching market book data:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
