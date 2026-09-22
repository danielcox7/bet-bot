export async function getDogLastRace(dogName) {
  if (!dogName) return null;

  try {
    // Clean the name (e.g. "1. Milos Delivery (IRE)" -> "MILOS DELIVERY")
    const cleanDogName = dogName
      .replace(/^\d+\.\s+/, "") // Remove trap number prefix "1. "
      .replace(/\s*\(.*\)$/, "") // Remove suffix like "(IRE)"
      .trim()
      .toUpperCase();

    const searchUrl = `https://api.gbgb.org.uk/api/results?page=1&itemsPerPage=1&dogName=${encodeURIComponent(cleanDogName)}`;
    
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    
    if (!searchData || !searchData.items || searchData.items.length === 0) {
      return null;
    }

    const recentRace = searchData.items[0];
    const raceId = recentRace.raceId;
    const dogId = recentRace.dogId;

    if (!raceId) return null;

    // Fetch full race details to get the runTime
    const raceUrl = `https://api.gbgb.org.uk/api/results/race/${raceId}`;
    const raceRes = await fetch(raceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    if (!raceRes.ok) return null;
    const raceData = await raceRes.json();

    if (!raceData || raceData.length === 0 || !raceData[0].races || raceData[0].races.length === 0) {
      return null;
    }

    const raceDetails = raceData[0].races[0];
    const traps = raceDetails.traps || [];
    
    const dogResult = traps.find(t => t.dogId === dogId);
    if (!dogResult) return null;

    return {
      dogName: cleanDogName,
      raceId: raceId,
      position: parseInt(dogResult.resultPosition, 10) || null,
      runTime: parseFloat(dogResult.resultRunTime) || null,
      adjustedTime: parseFloat(dogResult.resultAdjustedTime) || null,
      trackName: raceData[0].trackName,
      raceDate: raceDetails.raceDate,
    };

  } catch (error) {
    console.error(`[GBGB API] Error fetching data for ${dogName}:`, error.message);
    return null;
  }
}
