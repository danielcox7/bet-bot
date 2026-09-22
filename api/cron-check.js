import { getBetfairSession } from "./betfair-auth.js";
import { placeSpLayOrder } from "./place-sp-bet.js";
import { readState, saveState } from "./db.js";
import { getDogLastRace } from "./get-gbgb-form.js";

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
      
      const trapRunners = {};
      const trapOdds = {};

      market.runners?.forEach((runner) => {
        const rawOdd = raceOdds[runner.selectionId];
        const sp = convertToDecimal(rawOdd);
        const back = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
        const diff = back - (sp ?? 0);
        
        // Extract static info for dog name and trap number
        const staticInfo = raceInfo?.runners?.find((r) => r.selectionId === runner.selectionId);
        let dogName = staticInfo ? staticInfo.runnerName : `Dog ${runner.selectionId}`;
        let trapNumber = "—";
        const trapMatch = dogName.match(/^(\d+)\.\s+(.*)/);
        if (trapMatch) {
          trapNumber = parseInt(trapMatch[1], 10);
          dogName = trapMatch[2];
          trapRunners[trapNumber] = {
            selectionId: runner.selectionId,
            dogName: dogName,
            runner,
          };
          trapOdds[trapNumber] = back; // use current back price for odds comparison
        }

        if (sp !== null && back && diff >= 2) {
          isGreen = true;
          if (!qualifyingRunner) {
            qualifyingRunner = runner;
            qualifyingInfo = { trapNumber, dogName, selectionId: runner.selectionId };
          }
        }
      });
      
      // Evaluate Trap 2 Strategy
      let isTrap2Squeeze = false;
      let trap2QualifyingInfo = null;

      const t1 = trapRunners[1];
      const t2 = trapRunners[2];
      const t3 = trapRunners[3];

      if (t1 && t2 && t3 && trapOdds[1] && trapOdds[2] && trapOdds[3]) {
        if (trapOdds[2] > trapOdds[1] && trapOdds[2] > trapOdds[3]) {
          const [form1, form2, form3] = await Promise.all([
            getDogLastRace(t1.dogName),
            getDogLastRace(t2.dogName),
            getDogLastRace(t3.dogName)
          ]);

          if (form1 && form2 && form3) {
            const isT1WorseTime = form1.runTime && form2.runTime && (form1.runTime > form2.runTime);
            const isT1WorsePos = form1.position && form2.position && (form1.position > form2.position);
            
            const isT3WorseTime = form3.runTime && form2.runTime && (form3.runTime > form2.runTime);
            const isT3WorsePos = form3.position && form2.position && (form3.position > form2.position);

            const t1Worse = isT1WorseTime || isT1WorsePos;
            const t3Worse = isT3WorseTime || isT3WorsePos;

            if (t1Worse && t3Worse) {
              isTrap2Squeeze = true;
              trap2QualifyingInfo = {
                runner: t2.runner,
                selectionId: t2.selectionId,
                dogName: t2.dogName,
                trapNumber: 2,
                odds: trapOdds[2],
                form1, form2, form3
              };
            }
          }
        }
      }

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

        // 2. Evaluate Auto-LAY order placement for GREEN
        const isAutoLayActive = autoLayEnabled || autoLayPerRace[marketId];
        const betAlreadyPlaced = Boolean(placedBets[marketId]);

        if (isAutoLayActive && !betAlreadyPlaced && qualifyingRunner) {
          const raceLabel = raceInfo ? `${raceInfo.name} (${raceInfo.venue})` : `Race ID ${marketId}`;
          const runnerLabel = qualifyingInfo ? `Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}` : `Selection ${qualifyingRunner.selectionId}`;

          if (simulationMode) {
            state.placedBets[marketId] = {
              timestamp: Date.now(),
              mode: "simulation",
              selectionId: qualifyingRunner.selectionId,
              maxLoss: maxLoss,
              strategy: "green"
            };
            const simMessage = `🧪 [TEST MODE] Green Auto-LAY Triggered!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)}\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
            await sendTelegramAlert(simMessage);
            results.push({ marketId, status: "auto_lay_simulated_green", maxLoss });
          } else {
            try {
              const orderRes = await placeSpLayOrder({ marketId, selectionId: qualifyingRunner.selectionId, maxLoss });
              state.placedBets[marketId] = {
                timestamp: Date.now(),
                mode: "live",
                selectionId: qualifyingRunner.selectionId,
                maxLoss: maxLoss,
                result: orderRes,
                strategy: "green"
              };
              const liveMessage = `🚀 [LIVE BET] Green Auto-LAY Placed!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)}\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
              await sendTelegramAlert(liveMessage);
              results.push({ marketId, status: "auto_lay_live_success_green", maxLoss, orderRes });
            } catch (betErr) {
              console.error(`[cron-check] Green Auto-LAY placement failed for market ${marketId}:`, betErr);
              const failMessage = `⚠️ [LIVE BET FAILED] Green Auto-LAY failed!\n• Race: ${raceLabel}\n• Error: ${betErr.message}`;
              await sendTelegramAlert(failMessage);
              results.push({ marketId, status: "auto_lay_live_failed_green", error: betErr.message });
            }
          }
        } else {
          results.push({ marketId, status: "checked_green", alertSent: Boolean(sentAlerts[marketId]), betPlaced: betAlreadyPlaced });
        }
      }
      
      if (isTrap2Squeeze) {
        const alertKey = `${marketId}_trap2`;
        if (!sentAlerts[alertKey]) {
          let message = raceInfo
            ? `🔥 Trap 2 Squeeze Detected: ${raceInfo.name} at ${raceInfo.time} (${raceInfo.venue})\n`
            : `🔥 Trap 2 Squeeze Detected for Race ID ${marketId}\n`;
          
          message += `• Trap 2: ${trap2QualifyingInfo.dogName} (Odds: ${trap2QualifyingInfo.odds})\n`;
          message += `  - T2 Last Time: ${trap2QualifyingInfo.form2.runTime || 'N/A'}s (Pos: ${trap2QualifyingInfo.form2.position || 'N/A'})\n`;
          message += `• Trap 1: ${t1.dogName} (Odds: ${trapOdds[1]})\n`;
          message += `  - T1 Last Time: ${trap2QualifyingInfo.form1.runTime || 'N/A'}s (Pos: ${trap2QualifyingInfo.form1.position || 'N/A'})\n`;
          message += `• Trap 3: ${t3.dogName} (Odds: ${trapOdds[3]})\n`;
          message += `  - T3 Last Time: ${trap2QualifyingInfo.form3.runTime || 'N/A'}s (Pos: ${trap2QualifyingInfo.form3.position || 'N/A'})`;

          const sent = await sendTelegramAlert(message);
          if (sent) state.sentAlerts[alertKey] = true;
        }

        const isAutoLayActive = autoLayEnabled || autoLayPerRace[marketId];
        const betAlreadyPlaced = Boolean(placedBets[`${marketId}_trap2`]);

        if (isAutoLayActive && !betAlreadyPlaced && trap2QualifyingInfo) {
          const raceLabel = raceInfo ? `${raceInfo.name} (${raceInfo.venue})` : `Race ID ${marketId}`;
          const runnerLabel = `Trap 2, ${trap2QualifyingInfo.dogName}`;

          if (simulationMode) {
            state.placedBets[`${marketId}_trap2`] = {
              timestamp: Date.now(),
              mode: "simulation",
              selectionId: trap2QualifyingInfo.selectionId,
              maxLoss: maxLoss,
              strategy: "trap2_squeeze"
            };
            const simMessage = `🧪 [TEST MODE] Trap 2 Squeeze Auto-LAY Triggered!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)}\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
            await sendTelegramAlert(simMessage);
            results.push({ marketId, status: "auto_lay_simulated_trap2", maxLoss });
          } else {
            try {
              const orderRes = await placeSpLayOrder({ marketId, selectionId: trap2QualifyingInfo.selectionId, maxLoss });
              state.placedBets[`${marketId}_trap2`] = {
                timestamp: Date.now(),
                mode: "live",
                selectionId: trap2QualifyingInfo.selectionId,
                maxLoss: maxLoss,
                result: orderRes,
                strategy: "trap2_squeeze"
              };
              const liveMessage = `🚀 [LIVE BET] Trap 2 Squeeze Auto-LAY Placed!\n• Max Loss: £${parseFloat(maxLoss).toFixed(2)}\n• Race: ${raceLabel}\n• Runner: ${runnerLabel}`;
              await sendTelegramAlert(liveMessage);
              results.push({ marketId, status: "auto_lay_live_success_trap2", maxLoss, orderRes });
            } catch (betErr) {
              console.error(`[cron-check] Trap 2 Squeeze Auto-LAY failed for market ${marketId}:`, betErr);
              const failMessage = `⚠️ [LIVE BET FAILED] Trap 2 Squeeze Auto-LAY failed!\n• Race: ${raceLabel}\n• Error: ${betErr.message}`;
              await sendTelegramAlert(failMessage);
              results.push({ marketId, status: "auto_lay_live_failed_trap2", error: betErr.message });
            }
          }
        } else {
           results.push({ marketId, status: "checked_trap2", alertSent: Boolean(sentAlerts[`${marketId}_trap2`]), betPlaced: betAlreadyPlaced });
        }
      }

      if (!isGreen && !isTrap2Squeeze) {
        results.push({ marketId, status: "checked_not_qualified" });
      }
    } catch (err) {
      console.error(`[cron-check] Error checking market ${marketId}:`, err);
      results.push({ marketId, status: "error", error: err.message });
    }
  }

  await saveState(state);
  return results;
}

export default async function handler(req, res) {
  const state = await readState();
  const { qualifiedRaces = [] } = state;

  if (!qualifiedRaces.length) {
    return res.status(200).json({ status: "OK", checkedCount: 0, message: "No qualified races to check", debugState: state });
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
