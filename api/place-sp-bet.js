import { getBetfairSession, invalidateSession } from "./betfair-auth.js";

export async function placeSpLayOrder({ marketId, selectionId, maxLoss }) {
  if (!marketId || !selectionId || !maxLoss) {
    throw new Error("Missing required parameters: marketId, selectionId, maxLoss");
  }

  const { sessionToken, appKey } = await getBetfairSession();

  const payload = {
    marketId: marketId,
    instructions: [
      {
        selectionId: parseInt(selectionId, 10),
        handicap: 0,
        side: "LAY",
        orderType: "MARKET_ON_CLOSE",
        marketOnCloseOrder: {
          liability: parseFloat(maxLoss),
        },
      },
    ],
  };

  const response = await fetch("https://api.betfair.com/exchange/betting/rest/v1.0/placeOrders/", {
    method: "POST",
    headers: {
      "X-Application": appKey,
      "X-Authentication": sessionToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    invalidateSession();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Betfair placeOrders HTTP error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (data.status !== "SUCCESS") {
    const errorMsg = data.instructionReports?.[0]?.errorCode || data.errorCode || JSON.stringify(data);
    throw new Error(`Betfair placeOrders failed: ${errorMsg}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const { marketId, selectionId, maxLoss } = body || {};

  try {
    const result = await placeSpLayOrder({ marketId, selectionId, maxLoss });
    return res.status(200).json({ status: "SUCCESS", result });
  } catch (err) {
    console.error("[place-sp-bet] Order placement failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
