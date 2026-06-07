export const handler = async (event) => {
  const APP_KEY = process.env.BETFAIR_APP_KEY;
  const SESSION_TOKEN = process.env.BETFAIR_SESSION_TOKEN;

  // Return mock data if keys are missing so the UI still works
  if (!APP_KEY || !SESSION_TOKEN) {
    const mockRaces = [
      {
        id: "1.101",
        venue: "Newcastle (Mock)",
        time: "14:04",
        name: "600m Bch",
      },
      {
        id: "1.102",
        venue: "Nottingham (Mock)",
        time: "14:12",
        name: "500m A1",
      },
      { id: "1.103", venue: "Yarmouth (Mock)", time: "14:19", name: "462m A3" },
    ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockRaces),
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
          "X-Application": APP_KEY,
          "X-Authentication": SESSION_TOKEN,
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
          },
          maxResults: 100,
          marketProjection: ["EVENT", "MARKET_START_TIME"],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Betfair API call failed:", errorText);
      throw new Error(`Betfair API responded with ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data))
      throw new Error("Invalid response format from Betfair");

    const formattedRaces = data
      .sort((a, b) => new Date(a.marketStartTime) - new Date(b.marketStartTime))
      .map((market) => ({
        id: market.marketId,
        venue: market.event?.venue || market.event?.name || "Unknown Venue",
        name: market.marketName,
        time: new Date(market.marketStartTime).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formattedRaces),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
