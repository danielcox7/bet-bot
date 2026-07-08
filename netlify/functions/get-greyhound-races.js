export const handler = async (event) => {
  console.log("Netlify function 'get-greyhound-races' invoked."); // Added for debugging
  const APP_KEY = process.env.BETFAIR_APP_KEY;
  const SESSION_TOKEN = process.env.BETFAIR_SESSION_TOKEN;

  // Mock data for development when keys are missing
  if (!APP_KEY || !SESSION_TOKEN) {
    console.warn("Betfair keys missing. Returning mock race data.");
    const mockRaces = [
      // Simplified mock data
      {
        id: "1.240123456",
        time: "14:10",
        venue: "Hove",
        name: "600m Grad",
        runners: [{ selectionId: 1, runnerName: "Swift Gilly" }],
      },
      {
        id: "1.240123457",
        time: "14:30",
        venue: "Monmore",
        name: "480m OR",
        runners: [{ selectionId: 4, runnerName: "Vixons Pride" }],
      },
      {
        id: "1.240123458",
        time: "14:50",
        venue: "Romford",
        name: "400m Grad",
        runners: [{ selectionId: 6, runnerName: "Coolavanny Aunty" }],
      },
    ]; // Keep runners for basic display, but no form-specific data

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockRaces),
    };
  }

  try {
    // Get the start and end of today for the filter
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
            eventTypeIds: ["4339"], // Greyhound Racing
            marketStartTime: {
              from: now.toISOString(),
              to: endOfDay.toISOString(),
            },
            marketTypeCodes: ["WIN"],
            marketCountries: ["GB"],
          },
          maxResults: 200,
          marketProjection: [
            "EVENT",
            "MARKET_START_TIME",
            "RUNNER_DESCRIPTION",
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Betfair listMarketCatalogue API call failed: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `Betfair API responded with ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();

    const races = data.map((m) => ({
      id: m.marketId,
      time: new Date(m.marketStartTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      venue: m.event.venue || m.event.name,
      name: m.marketName,
      runners: m.runners.map((r) => ({
        selectionId: r.selectionId,
        runnerName: r.runnerName,
      })),
    }));
    console.log(
      `[get-greyhound-races] Server: Returning ${races.length} races. Market IDs: ${races.map((r) => r.id).join(", ")}`,
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(races),
    };
  } catch (error) {
    console.error("Error fetching greyhound races:", error); // Added for debugging
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
