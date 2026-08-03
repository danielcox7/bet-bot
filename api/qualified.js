import { readState, saveState } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const currentState = await readState();

  if (req.method === "GET") {
    return res.status(200).json(currentState);
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    if (body?.qualifiedRaces !== undefined) {
      currentState.qualifiedRaces = body.qualifiedRaces;
    }

    if (body?.manualOdds !== undefined) {
      currentState.manualOdds = {
        ...currentState.manualOdds,
        ...body.manualOdds,
      };
    }

    if (body?.autoLayEnabled !== undefined) {
      currentState.autoLayEnabled = Boolean(body.autoLayEnabled);
    }

    if (body?.maxLoss !== undefined) {
      const num = parseFloat(body.maxLoss);
      if (!isNaN(num) && num > 0) {
        currentState.maxLoss = num;
      }
    }

    if (body?.simulationMode !== undefined) {
      currentState.simulationMode = Boolean(body.simulationMode);
    }

    if (body?.action === "toggleQualified" && body?.raceId) {
      const idx = currentState.qualifiedRaces.indexOf(body.raceId);
      if (idx > -1) {
        currentState.qualifiedRaces.splice(idx, 1);
      } else {
        currentState.qualifiedRaces.push(body.raceId);
      }
    }

    if (body?.action === "toggleAutoLayPerRace" && body?.raceId) {
      currentState.autoLayPerRace[body.raceId] = !currentState.autoLayPerRace[body.raceId];
    }

    if (body?.action === "setOdds" && body?.marketId && body?.selectionId !== undefined) {
      if (!currentState.manualOdds[body.marketId]) {
        currentState.manualOdds[body.marketId] = {};
      }
      currentState.manualOdds[body.marketId][body.selectionId] = body.oddVal;
    }

    if (body?.racesInfo && Array.isArray(body.racesInfo)) {
      body.racesInfo.forEach((r) => {
        if (r.id) currentState.racesCache[r.id] = r;
      });
    }

    await saveState(currentState);
    return res.status(200).json(currentState);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
