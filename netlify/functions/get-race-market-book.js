export const handler = async (event) => {
  const APP_KEY = process.env.BETFAIR_APP_KEY;
  const SESSION_TOKEN = process.env.BETFAIR_SESSION_TOKEN;

  // Ensure the request method is POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Method Not Allowed. Only POST requests are accepted.",
      }),
    };
  }

  // Parse the request body to get the marketId
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

  // Return mock data if keys are missing for development/testing
  if (!APP_KEY || !SESSION_TOKEN) {
    console.warn(
      "BETFAIR_APP_KEY or BETFAIR_SESSION_TOKEN missing. Returning mock market book data.",
    );
    const mockMarketBook = {
      marketId: marketId,
      isMarketDataDelayed: true,
      status: "OPEN",
      betDelay: 0,
      runners: [
        {
          selectionId: 1,
          lastPriceTraded: 5.0,
          totalMatched: 1000,
          ex: {
            availableToBack: [{ price: 5.0, size: 100 }],
            availableToLay: [{ price: 5.2, size: 50 }],
          },
        },
        {
          selectionId: 2,
          lastPriceTraded: 3.5,
          totalMatched: 1500,
          ex: {
            availableToBack: [{ price: 3.5, size: 200 }],
            availableToLay: [{ price: 3.6, size: 80 }],
          },
        },
        {
          selectionId: 3,
          lastPriceTraded: 8.0,
          totalMatched: 500,
          ex: {
            availableToBack: [{ price: 8.0, size: 50 }],
            availableToLay: [{ price: 8.4, size: 20 }],
          },
        },
      ],
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([mockMarketBook]), // listMarketBook returns an array
    };
  }

  try {
    const response = await fetch(
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/",
      {
        method: "POST",
        headers: {
          "X-Application": APP_KEY,
          "X-Authentication": SESSION_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketIds: [marketId],
          priceProjection: { priceData: ["EX_BEST_OFFERS", "EX_TRADED"] }, // Request best offers and traded prices
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Betfair listMarketBook API call failed for marketId ${marketId}:`,
        errorText,
      );
      throw new Error(
        `Betfair API responded with ${response.status}: ${errorText}`,
      );
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
