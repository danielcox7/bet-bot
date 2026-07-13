/**
 * Shared Betfair authentication helper.
 * Caches the session token in memory for the lifetime of the Lambda container
 * so we only log in once rather than on every single function invocation.
 * Re-authenticates automatically if the token has expired (older than 3 hours).
 */

// In-memory cache — persists across warm invocations of the same Lambda container
let cachedToken = null;
let tokenObtainedAt = null;
const TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours (Betfair tokens last ~4 hours)

export const getBetfairSession = async () => {
  const APP_KEY = process.env.BETFAIR_APP_KEY;
  const USERNAME = process.env.BETFAIR_USERNAME;
  const PASSWORD = process.env.BETFAIR_PASSWORD;

  if (!APP_KEY || !USERNAME || !PASSWORD) {
    throw new Error(
      "Missing Betfair credentials: BETFAIR_APP_KEY, BETFAIR_USERNAME and BETFAIR_PASSWORD must all be set."
    );
  }

  const now = Date.now();
  const tokenAge = tokenObtainedAt ? now - tokenObtainedAt : Infinity;

  // Return cached token if it's still fresh
  if (cachedToken && tokenAge < TOKEN_TTL_MS) {
    console.log(`[betfair-auth] Reusing cached token (age: ${Math.round(tokenAge / 60000)}m)`);
    return { sessionToken: cachedToken, appKey: APP_KEY };
  }

  console.log("[betfair-auth] Fetching fresh session token from Betfair...");

  const params = new URLSearchParams({ username: USERNAME, password: PASSWORD });

  const response = await fetch("https://identitysso.betfair.com/api/login", {
    method: "POST",
    headers: {
      "X-Application": APP_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Betfair login HTTP error ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (data.status !== "SUCCESS" || !data.token) {
    throw new Error(`Betfair login failed: ${data.error || JSON.stringify(data)}`);
  }

  // Cache the new token
  cachedToken = data.token;
  tokenObtainedAt = now;

  console.log("[betfair-auth] Login successful, session token cached.");
  return { sessionToken: cachedToken, appKey: APP_KEY };
};

/**
 * Call this to force a fresh login on the next request (e.g. after a 401 response).
 */
export const invalidateSession = () => {
  cachedToken = null;
  tokenObtainedAt = null;
  console.log("[betfair-auth] Session cache cleared — will re-login on next request.");
};
