import { readFileSync, writeFileSync } from "fs";
import { getBetfairSession } from "./betfair-auth.js";

const STATE_FILE = "/tmp/betbot_state.json";

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      qualifiedRaces: [],
      manualOdds: {},
      sentAlerts: {},
      racesCache: {}
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

export default async function handler(req, res) {
  const state = readState();
  const { qualifiedRaces = [], manualOdds = {}, sentAlerts = {}, racesCache = {} } = state;

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

  const results = [];

  for (const marketId of qualifiedRaces) {
    if (sentAlerts[marketId]) {
      results.push({ marketId, status: "already_sent" });
      continue;
    }

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

      market.runners?.forEach((runner) => {
        const rawOdd = raceOdds[runner.selectionId];
        const sp = convertToDecimal(rawOdd);
        const back = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
        const diff = back - (sp ?? 0);

        if (sp !== null && back && diff >= 2) {
          isGreen = true;
          if (!qualifyingInfo) {
            const staticInfo = raceInfo?.runners?.find((r) => r.selectionId === runner.selectionId);
            let dogName = staticInfo ? staticInfo.runnerName : `Dog ${runner.selectionId}`;
            let trapNumber = "—";
            const trapMatch = dogName.match(/^(\d+)\.\s+(.*)/);
            if (trapMatch) {
              trapNumber = trapMatch[1];
              dogName = trapMatch[2];
            }
            qualifyingInfo = { trapNumber, dogName };
          }
        }
      });

      if (isGreen) {
        let message = raceInfo
          ? `✅ Qualified race (green) detected: ${raceInfo.name} at ${raceInfo.time} (${raceInfo.venue})`
          : `✅ Race ID ${marketId} qualified (green)`;

        if (qualifyingInfo) {
          message += ` – Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}`;
        }

        const sent = await sendTelegramAlert(message);
        if (sent) {
          state.sentAlerts[marketId] = true;
          results.push({ marketId, status: "alert_sent", message });
        } else {
          results.push({ marketId, status: "alert_failed" });
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
  return res.status(200).json({ status: "OK", checkedCount: qualifiedRaces.length, results });
}
