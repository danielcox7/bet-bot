/**
 * Vercel Serverless Function: get-greyhound-form
 *
 * Checks GBGB official race results to determine if the dog in Trap 1
 * won its last race at the same track/venue and distance (C&D Winner).
 */

const formCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

// Helper to normalize track names for robust matching
const normalizeTrack = (track) => {
  if (!track) return "";
  return track
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(stadium|track|park|downs)$/, "")
    .replace(/[^a-z0-9]/g, "");
};

// Check a single dog on GBGB
const fetchDogLastRace = async (dogName) => {
  const cleanName = dogName.replace(/^[1-8]\.\s*/, "").trim();
  const cached = formCache.get(cleanName.toLowerCase());
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

    if (!autoRes.ok) {
      return null;
    }

    const autoData = await autoRes.json();
    if (!Array.isArray(autoData) || autoData.length === 0) {
      return null;
    }

    // Match exact name if possible, otherwise first result
    const match =
      autoData.find((d) => d.dogName.toLowerCase() === cleanName.toLowerCase()) ||
      autoData[0];

    if (!match?.dogId) {
      return null;
    }

    // Step 2: Fetch last races for this dog
    const histUrl = `https://api.gbgb.org.uk/api/results/dog/${match.dogId}?page=1&itemsPerPage=5`;
    const histRes = await fetch(histUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (BetBot/1.0)" },
    });

    if (!histRes.ok) {
      return null;
    }

    const histData = await histRes.json();
    const items = histData.items || [];
    if (items.length === 0) {
      return null;
    }

    // Find the most recent completed race with a resultPosition
    const completed = items.filter((r) => r.resultPosition !== null && r.resultPosition !== undefined);
    if (completed.length === 0) {
      return null;
    }

    const last = completed[0];
    const result = {
      dogName: match.dogName,
      dogId: match.dogId,
      resultPosition: last.resultPosition,
      trackName: last.trackName,
      raceDistance: last.raceDistance,
      raceDate: last.raceDate,
      trapNumber: last.trapNumber,
    };

    formCache.set(cleanName.toLowerCase(), { data: result, timestamp: now });
    return result;
  } catch (err) {
    console.error(`[get-greyhound-form] Error fetching form for ${cleanName}:`, err.message);
    return null;
  }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const races = req.body?.races || [];
    if (!Array.isArray(races) || races.length === 0) {
      // Allow single query via query parameters
      const { dogName, venue, distance } = req.query;
      if (dogName) {
        const lastRace = await fetchDogLastRace(dogName);
        if (!lastRace) {
          return res.status(200).json({ isCDWinner: false, lastRace: null });
        }
        const venueMatch = normalizeTrack(lastRace.trackName) === normalizeTrack(venue);
        const distMatch = parseInt(lastRace.raceDistance) === parseInt(distance);
        const won = lastRace.resultPosition === 1;
        return res.status(200).json({
          isCDWinner: won && venueMatch && distMatch,
          won,
          venueMatch,
          distMatch,
          lastRace,
        });
      }
      return res.status(400).json({ error: "No races provided in body or query" });
    }

    // Batch process races in small concurrency chunks (3 at a time) to be gentle on GBGB
    const results = {};
    const chunkSize = 4;
    for (let i = 0; i < races.length; i += chunkSize) {
      const chunk = races.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (race) => {
          const { id, trap1Dog, venue, distance } = race;
          if (!trap1Dog) {
            results[id] = { isCDWinner: false, lastRace: null };
            return;
          }

          const lastRace = await fetchDogLastRace(trap1Dog);
          if (!lastRace) {
            results[id] = { isCDWinner: false, lastRace: null };
            return;
          }

          const venueMatch =
            normalizeTrack(lastRace.trackName).includes(normalizeTrack(venue)) ||
            normalizeTrack(venue).includes(normalizeTrack(lastRace.trackName));
          const distMatch = parseInt(lastRace.raceDistance) === parseInt(distance);
          const won = lastRace.resultPosition === 1;

          results[id] = {
            isCDWinner: won && venueMatch && distMatch,
            won,
            venueMatch,
            distMatch,
            lastRace: {
              track: lastRace.trackName,
              dist: lastRace.raceDistance,
              pos: lastRace.resultPosition,
              date: lastRace.raceDate,
            },
          };
        })
      );
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error("[get-greyhound-form] Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}
