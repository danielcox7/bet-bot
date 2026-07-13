import { getBetfairSession, invalidateSession } from "./betfair-auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Only POST requests are accepted." });
  }

  // Vercel automatically parses JSON bodies if the content-type is application/json
  let marketId = req.body?.marketId;
  
  // fallback for string bodies just in case
  if (!marketId && typeof req.body === 'string') {
     try {
       marketId = JSON.parse(req.body).marketId;
     } catch(e) {}
  }

  if (!marketId) {
    return res.status(400).json({ error: "Missing marketId in request body." });
  }

  let sessionToken, appKey;
  try {
    ({ sessionToken, appKey } = await getBetfairSession());
  } catch (authError) {
    console.error("Betfair authentication failed:", authError.message);
    return res.status(500).json({ error: `Authentication failed: ${authError.message}` });
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

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching market book data:", error);
    return res.status(500).json({ error: error.message });
  }
}
