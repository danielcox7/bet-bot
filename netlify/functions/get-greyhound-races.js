import { getBetfairSession, invalidateSession } from "./betfair-auth.js";

export const handler = async (event) => {
  console.log("Netlify function 'get-greyhound-races' invoked.");

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
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const response = await fetch(
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketCatalogue/",
      {
        method: "POST",
        headers: {
          "X-Application": appKey,
          "X-Authentication": sessionToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            eventTypeIds: ["4339"],
            marketStartTime: {
              from: now.toISOString(),
              to: endOfDay.toISOString(),
            },
            marketTypeCodes: ["WIN"],
            marketCountries: ["GB"],
          },
          maxResults: 200,
          marketProjection: ["EVENT", "MARKET_START_TIME", "RUNNER_DESCRIPTION"],
        }),
      }
    );

    // If Betfair says the token is invalid, clear cache so next call re-logs in
    if (response.status === 401 || response.status === 403) {
      invalidateSession();
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Betfair listMarketCatalogue failed: ${response.status} - ${errorText}`);
      throw new Error(`Betfair API responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    const races = data.map((m) => ({
      id: m.marketId,
      time: new Date(m.marketStartTime).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }),
      venue: m.event.venue || m.event.name,
      name: m.marketName,
      runners: m.runners.map((r) => ({
        selectionId: r.selectionId,
        runnerName: r.runnerName,
      })),
    }));

    console.log(`[get-greyhound-races] Returning ${races.length} races.`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(races),
    };
  } catch (error) {
    console.error("Error fetching greyhound races:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
