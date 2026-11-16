/**
 * Vercel Serverless Function: get-greyhound-form
 *
 * For each race checks:
 *  - Trap 1: did it win its last race? (any venue)  → trap1Won
 *  - Trap 1: did it win its last race at same C&D?  → isCDWinner
 *  - Trap 2: what were its last-race odds (BSP)?    → trap2LastOdds
 *  - Trap 2: last odds > 4 AND trap 1 won?          → qualifies
 */

const formCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Mapping of alternative / abbreviated GBGB track names → Betfair venue names
// Keys and values are lowercased for lookup; add new entries as mismatches appear.
const VENUE_ALIASES = {
  valley: "swindon",
  owlerton: "sheffield",
  wimbledon: "wimbledon",
  henlow: "henlow",
  monmore: "monmore",
  pelaw: "pelaw grange",
  shelbourne: "shelbourne park",
  harolds: "harolds cross",
  // Add more as needed – both directions are checked
};

// Normalise track names for robust venue matching
const normalizeTrack = (track) => {
  if (!track) return "";
  return track
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(stadium|track|park|downs|greyhound|green)$/g, "")
    .replace(/\s*\(.*?\)\s*/g, "") // remove parenthetical e.g. "(Owlerton)"
    .replace(/[^a-z0-9]/g, "");
};

// Check if two venue names refer to the same track
const venuesMatch = (gbgbTrack, betfairVenue) => {
  const a = normalizeTrack(gbgbTrack);
  const b = normalizeTrack(betfairVenue);
  if (!a || !b) return false;
  // Direct substring match (existing logic)
  if (a.includes(b) || b.includes(a)) return true;
  // Alias lookup
  const aliasA = VENUE_ALIASES[a];
  const aliasB = VENUE_ALIASES[b];
  if (aliasA && normalizeTrack(aliasA) === b) return true;
  if (aliasB && normalizeTrack(aliasB) === a) return true;
  // Check if both map to the same canonical name
  if (aliasA && aliasB && normalizeTrack(aliasA) === normalizeTrack(aliasB)) return true;
  return false;
};

// Convert fractional SP string (e.g. "5/1", "2/1F", "11/4") to a decimal number
const parseSP = (sp) => {
  if (sp === null || sp === undefined) return null;
  if (typeof sp === "number") return sp;
  const str = String(sp).replace(/[A-Za-z]/g, "").trim(); // strip "F", "J" etc.
  if (str.includes("/")) {
    const [num, den] = str.split("/").map(Number);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den + 1; // fractional → decimal
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
};

/**
 * Fetch the most-recent completed race for a named dog from GBGB.
 * Returns { dogName, dogId, resultPosition, trackName, raceDistance, raceDate, trapNumber, bsp }
 * or null on failure.
 */
const fetchDogLastRace = async (dogName) => {
  const cleanName = dogName.replace(/^[1-8]\.\s*/, "").trim();
  const cacheKey = cleanName.toLowerCase();
  const cached = formCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // Step 1: Autocomplete lookup to get official dogId
    const autoUrl = `https://api.gbgb.org.uk/api/dogs/autocomplete/${encodeURIComponent(cleanName)}`;
    const autoRes = await fetch(autoUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (BetBot/1.0)" },
    });
    if (!autoRes.ok) return null;

    const autoData = await autoRes.json();
    if (!Array.isArray(autoData) || autoData.length === 0) return null;

    // Prefer exact name match, fall back to first result
    const match =
      autoData.find((d) => d.dogName.toLowerCase() === cleanName.toLowerCase()) ||
      autoData[0];

    if (!match?.dogId) return null;

    // Step 2: Fetch recent race history (ask for 10 to find a completed one)
    const histUrl = `https://api.gbgb.org.uk/api/results/dog/${match.dogId}?page=1&itemsPerPage=10`;
    const histRes = await fetch(histUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (BetBot/1.0)" },
    });
    if (!histRes.ok) return null;

    const histData = await histRes.json();
    const items = histData.items || [];

    // Find the most recent race with a finalised result position
    const completed = items.filter(
      (r) => r.resultPosition !== null && r.resultPosition !== undefined
    );
    if (completed.length === 0) return null;

    const last = completed[0];
    const result = {
      dogName: match.dogName,
      dogId: match.dogId,
      resultPosition: last.resultPosition,
      trackName: last.trackName,
      raceDistance: last.raceDistance,       // e.g. 500 (integer from GBGB)
      raceDate: last.raceDate,
      trapNumber: last.trapNumber,
      bsp: parseSP(last.SP ?? last.bsp ?? null),  // Starting price as decimal
    };

    formCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch (err) {
    console.error(`[get-greyhound-form] Error for "${cleanName}":`, err.message);
    return null;
  }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const races = req.body?.races || [];
    if (!Array.isArray(races) || races.length === 0) {
      // Single-query fallback via query parameters
      const { dogName, venue, distance } = req.query;
      if (dogName) {
        const lastRace = await fetchDogLastRace(dogName);
        if (!lastRace) return res.status(200).json({ isCDWinner: false, lastRace: null });
        const venueMatch = venuesMatch(lastRace.trackName, venue);
        const distMatch = parseInt(lastRace.raceDistance) === parseInt(distance);
        const won = lastRace.resultPosition === 1;
        return res.status(200).json({
          isCDWinner: won && venueMatch && distMatch,
          trap1Won: won,
          venueMatch,
          distMatch,
          lastRace,
        });
      }
      return res.status(400).json({ error: "No races provided in body or query" });
    }

    // Batch process in chunks of 5 (balance speed vs GBGB rate limits)
    const results = {};
    const chunkSize = 5;

    for (let i = 0; i < races.length; i += chunkSize) {
      const chunk = races.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (race) => {
          try {
          const { id, trap1Dog, trap2Dog, venue, distance } = race;

          // ── Trap 1 form ──────────────────────────────────────────────
          let trap1Won = false;
          let isCDWinner = false;
          let trap1LastRace = null;

          if (trap1Dog) {
            const t1 = await fetchDogLastRace(trap1Dog);
            if (t1) {
              const venueMatch = venuesMatch(t1.trackName, venue);
              const distMatch = parseInt(t1.raceDistance) === parseInt(distance);
              trap1Won = t1.resultPosition === 1;
              isCDWinner = trap1Won && venueMatch && distMatch;
              trap1LastRace = {
                track: t1.trackName,
                dist: t1.raceDistance,
                pos: t1.resultPosition,
                date: t1.raceDate,
                venueMatch,
                distMatch,
              };
            }
          }

          // ── Trap 2 last-race odds ────────────────────────────────────
          let trap2LastOdds = null;
          let trap2LastRace = null;

          if (trap2Dog) {
            const t2 = await fetchDogLastRace(trap2Dog);
            if (t2) {
              trap2LastOdds = t2.bsp;
              trap2LastRace = {
                track: t2.trackName,
                dist: t2.raceDistance,
                pos: t2.resultPosition,
                date: t2.raceDate,
                bsp: t2.bsp,
              };
            }
          }

          // ── Combined filter ──────────────────────────────────────────
          // Core profitable rule: Trap 1 won last race + Trap 2 last odds > 4
          const trap2OddsOk = trap2LastOdds !== null && trap2LastOdds > 4.0;
          const qualifies = trap1Won && trap2OddsOk;

          results[id] = {
            isCDWinner,          // Trap 1 won at same C&D
            trap1Won,            // Trap 1 won its last race (any venue)
            qualifies,           // Trap 1 won + Trap 2 odds > 4
            trap2LastOdds,       // Trap 2's BSP in last race (or null)
            trap2OddsOk,         // trap2LastOdds > 4
            lastRace: trap1LastRace,
            trap2LastRace,
          };
          } catch (raceErr) {
            console.error(`[get-greyhound-form] Error processing race ${race?.id}:`, raceErr.message);
            // Continue with other races — don't let one failure break everything
          }
        })
      );
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error("[get-greyhound-form] Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}
