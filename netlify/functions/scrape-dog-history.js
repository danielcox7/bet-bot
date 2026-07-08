export const handler = async (event) => {
  const { dogName } = event.queryStringParameters;

  if (!dogName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "dogName is required" }),
    };
  }

  try {
    // 1. Clean the name for Sporting Life's search
    const cleanDogName = dogName
      .replace(/^\d+\.\s+/, "") // Remove trap number
      .replace(/\s*\(.*\)$/, "") // Remove (IRE), etc.
      .trim()
      .toUpperCase(); // Convert to uppercase for better matching

    const searchUrl = `https://www.sportinglife.com/api/v1/greyhounds/search/dog?name=${encodeURIComponent(cleanDogName)}`;

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    };

    // 2. Search for the Dog ID
    console.log(
      `Searching Sporting Life for "${cleanDogName}" at: ${searchUrl}`,
    ); // ADDED LOG
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) {
      console.error(
        `Sporting Life Search failed: ${searchRes.status} for dogName: ${cleanDogName}`,
      );
      return { statusCode: 200, body: JSON.stringify({ recentOdds: [] }) };
    }
    const searchData = await searchRes.json();
    console.log(`Sporting Life searchData for "${cleanDogName}":`, searchData); // ADDED LOG

    if (!searchData || searchData.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ recentOdds: [] }) };
    }

    // Take the first result
    const dogId = searchData[0].id;

    // 3. Fetch the Dog's profile (results history)
    // Sporting Life profile API returns historical race data
    const profileUrl = `https://www.sportinglife.com/api/v1/greyhounds/dog/${dogId}`;
    const profileRes = await fetch(profileUrl, { headers });
    if (!profileRes.ok) {
      console.error(
        `Sporting Life Profile fetch failed: ${profileRes.status} for dogId: ${dogId}`,
      );
      return { statusCode: 200, body: JSON.stringify({ recentOdds: [] }) };
    }
    const profileData = await profileRes.json();
    console.log(
      `Sporting Life profileData for "${cleanDogName}" (dogId: ${dogId}):`,
      profileData,
    ); // ADDED LOG

    if (!profileData || !profileData.results) {
      console.log(`No profile results for "${cleanDogName}" (dogId: ${dogId})`); // ADDED LOG
      return { statusCode: 200, body: JSON.stringify({ recentOdds: [] }) };
    }

    // 4. Extract the Starting Prices (SP)
    // We map through results and convert fractional SPs to decimals
    const recentOdds = profileData.results
      .filter((res) => res.sp) // Ensure an SP exists
      .slice(0, 3) // Get last 3
      .map((res) => {
        // ADDED LOG
        const sp = String(res.sp || ""); // Ensure sp is a string
        if (!sp) return null;

        if (sp.toLowerCase().includes("ev")) return 2.0;

        const fractionalMatch = sp.match(/(\d+)\/(\d+)/);
        if (fractionalMatch) {
          const num = parseInt(fractionalMatch[1], 10);
          const den = parseInt(fractionalMatch[2], 10);
          return parseFloat((num / den + 1).toFixed(2));
        }
        return null;
      })
      .filter((odd) => odd !== null);
    console.log(`Extracted recentOdds for "${cleanDogName}":`, recentOdds); // ADDED LOG

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
      body: JSON.stringify({
        dogName: cleanDogName,
        recentOdds,
      }),
    };
  } catch (error) {
    console.error("Sporting Life Scraper Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch Sporting Life data" }),
    };
  }
};
