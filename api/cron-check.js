import { readFileSync, writeFileSync } from "fs";
import { getBetfairSession } from "./betfair-auth.js";
import { placeSpLayOrder } from "./place-sp-bet.js";

const STATE_FILE = "/tmp/betbot_state.json";

function readState() {
  try {
    const data = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(data);
    return {
      qualifiedRaces: parsed.qualifiedRaces || [],
      manualOdds: parsed.manualOdds || {},
      sentAlerts: parsed.sentAlerts || {},
      racesCache: parsed.racesCache || {},
      autoLayEnabled: parsed.autoLayEnabled ?? false,
      maxLoss: parsed.maxLoss ?? 10,
      simulationMode: parsed.simulationMode ?? true,
      autoLayPerRace: parsed.autoLayPerRace || {},
      placedBets: parsed.placedBets || {},
    };
  } catch {
    return {
      qualifiedRaces: [],
      manualOdds: {},
      sentAlerts: {},
      racesCache: {},
      autoLayEnabled: false,
      maxLoss: 10,
      simulationMode: true,
      autoLayPerRace: {},
      placedBets: {},
    };
  }
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("[cron-check] Failed to write state file:", e);
  }
}

function convertToDecimal(oddStr) {
  if (!oddStr) return null;
  const trimmed = oddStr.toString().trim();
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        return num / den + 1;
      }
    }
  }
  const asNum = parseFloat(trimmed);
  return isNaN(asNum) ? null : asNum;
}

async function sendTelegramAlert(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("[cron-check] Telegram credentials missing");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      console.error("[cron-check] Telegram error:", response.status, text);
      return false;
    }
    console.log("[cron-check] Telegram alert sent successfully");
    return true;
  } catch (err) {
    console.error("[cron-check] Failed to send Telegram alert:", err);
    return false;
  }
}

async function runCheckOnce(state, sessionToken, appKey) {
  const {
    qualifiedRaces = [],
    manualOdds = {},
    sentAlerts = {},
    racesCache = {},
    autoLayEnabled = false,
    maxLoss = 10,
    simulationMode = true,
    autoLayPerRace = {},
    placedBets = {},
  } = state;

  const results = [];

  for (const marketId of qualifiedRaces) {
    try {
      const response = await fetch("https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/", {
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
      });

      if (!response.ok) {
        results.push({ marketId, status: "error", code: response.status });
        continue;
      }

      const marketBooks = await response.json();
      const market = marketBooks?.[0];
      if (!market) {
        results.push({ marketId, status: "not_found" });
        continue;
      }

      const raceInfo = racesCache[marketId];
      const raceOdds = manualOdds[marketId] || {};

      let isGreen = false;
      let qualifyingInfo = null;
      let qualifyingRunner = null;

      market.runners?.forEach((runner) => {
        const rawOdd = raceOdds[runner.selectionId];
        const sp = convertToDecimal(rawOdd);
        const back = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
        const diff = back - (sp ?? 0);

        if (sp !== null && back && diff >= 2) {
          isGreen = true;
          if (!qualifyingRunner) {
            qualifyingRunner = runner;
            const staticInfo = raceInfo?.runners?.find((r) => r.selectionId === runner.selectionId);
            let dogName = staticInfo ? staticInfo.runnerName : `Dog ${runner.selectionId}`;
            let trapNumber = "—";
            const trapMatch = dogName.match(/^(\d+)\.\s+(.*)/);
            if (trapMatch) {
              trapNumber = trapMatch[1];
              dogName = trapMatch[2];
            }
            qualifyingInfo = { trapNumber, dogName, selectionId: runner.selectionId };
          }
        }
      });

      if (isGreen) {
        // 1. Send green detection alert if not yet sent
        if (!sentAlerts[marketId]) {
          let message = raceInfo
            ? `✅ Qualified race (green) detected: ${raceInfo.name} at ${raceInfo.time} (${raceInfo.venue})`
            : `✅ Race ID ${marketId} qualified (green)`;

          if (qualifyingInfo) {
            message += ` – Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}`;
          }

          const sent = await sendTelegramAlert(message);
          if (sent) {
            state.sentAlerts[marketId] = true;
          }
        }

        // 2. Evaluate Auto-LAY order placement
        const isAutoLayActive = autoLayEnabled || autoLayPerRace[marketId];
        const betAlreadyPlaced = Boolean(placedBets[marketId]);

        if (isAutoLayActive && !betAlreadyPlaced && qualifyingRunner) {
          const raceLabel = raceInfo ? `${raceInfo.name} (${raceInfo.venue})` : `Race ID ${marketId}`;
          const runnerLabel = qualifyingInfo ? `Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}` : `Selection ${qualifyingRunner.selectionId}`;

          if (simulationMode) {
            // SIMULATION MODE
            state.placedBets[marketId] = {
              timestamp: Date.now(),
              mode: "simulation",
              selectionId: qualifyingRunner.selectionId,
              maxLoss: maxLoss,
            };

            const simMessage = `🧪 [TEST MODE] Auto-LAY Triggered!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)} @ SP\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
            await sendTelegramAlert(simMessage);
            results.push({ marketId, status: "auto_lay_simulated", maxLoss });
          } else {
            // LIVE MODE - SUBMIT REAL ORDER TO BETFAIR
            try {
              const orderRes = await placeSpLayOrder({
                marketId,
                selectionId: qualifyingRunner.selectionId,
                maxLoss,
              });

              state.placedBets[marketId] = {
                timestamp: Date.now(),
                mode: "live",
                selectionId: qualifyingRunner.selectionId,
                maxLoss: maxLoss,
                result: orderRes,
              };

              const liveMessage = `🚀 [LIVE BET] Auto-LAY Order Placed!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)} @ SP\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
              await sendTelegramAlert(liveMessage);
              results.push({ marketId, status: "auto_lay_live_success", maxLoss, orderRes });
            } catch (betErr) {
              console.error(`[cron-check] Auto-LAY placement failed for market ${marketId}:`, betErr);
              const failMessage = `⚠️ [LIVE BET FAILED] Could not place Auto-LAY!\n• Race: ${raceLabel}\n• Error: ${betErr.message}`;
              await sendTelegramAlert(failMessage);
              results.push({ marketId, status: "auto_lay_live_failed", error: betErr.message });
            }
          }
        } else {
          results.push({ marketId, status: "checked_green", alertSent: Boolean(sentAlerts[marketId]), betPlaced: betAlreadyPlaced });
        }
      } else {
        results.push({ marketId, status: "checked_not_green" });
      }
    } catch (err) {
      console.error(`[cron-check] Error checking market ${marketId}:`, err);
      results.push({ marketId, status: "error", error: err.message });
    }
  }

  saveState(state);
  return results;
}

export default async function handler(req, res) {
  const state = readState();
  const { qualifiedRaces = [] } = state;

  if (!qualifiedRaces.length) {
    return res.status(200).json({ status: "OK", checkedCount: 0, message: "No qualified races to check" });
  }

  let sessionToken, appKey;
  try {
    ({ sessionToken, appKey } = await getBetfairSession());
  } catch (err) {
    console.error("[cron-check] Betfair auth error:", err.message);
    return res.status(500).json({ error: `Betfair auth failed: ${err.message}` });
  }

  // Pass 1: Check immediately
  const pass1 = await runCheckOnce(state, sessionToken, appKey);

  // Short delay (4 seconds) for Pass 2 within the same invocation
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const pass2 = await runCheckOnce(state, sessionToken, appKey);

  return res.status(200).json({
    status: "OK",
    checkedCount: qualifiedRaces.length,
    passes: 2,
    pass1,
    pass2,
  });
}
