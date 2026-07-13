/**
 * Shared Betfair authentication helper.
 *
 * Uses a /tmp file to cache the session token so it persists across function
 * invocations in both local `netlify dev` and production Lambda containers.
 * Also implements a circuit-breaker: if Betfair rate-limits us we stop
 * retrying for 15 minutes so we don't make the ban worse.
 */

import { readFileSync, writeFileSync } from "fs";

const TOKEN_FILE = "/tmp/betfair_session.json";
const TOKEN_TTL_MS = 3 * 60 * 60 * 1000;      // 3 hours
const BAN_BACKOFF_MS = 15 * 60 * 1000;          // 15 minutes

/** Read cached state from /tmp, returns null if missing / corrupt. */
const readCache = () => {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
};

/** Persist cache state to /tmp. */
const writeCache = (data) => {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify(data), "utf8");
  } catch (e) {
    console.warn("[betfair-auth] Could not write token cache:", e.message);
  }
};

export const getBetfairSession = async () => {
  const APP_KEY  = process.env.BETFAIR_APP_KEY;
  const USERNAME = process.env.BETFAIR_USERNAME;
  const PASSWORD = process.env.BETFAIR_PASSWORD;

  if (!APP_KEY || !USERNAME || !PASSWORD) {
    throw new Error(
      "Missing Betfair credentials: BETFAIR_APP_KEY, BETFAIR_USERNAME and BETFAIR_PASSWORD must all be set."
    );
  }

  const now   = Date.now();
  const cache = readCache();

  // --- Circuit breaker: honour the ban window ---
  if (cache?.bannedUntil && now < cache.bannedUntil) {
    const minutesLeft = Math.ceil((cache.bannedUntil - now) / 60000);
    throw new Error(
      `Betfair login rate-limited. Retrying in ${minutesLeft} minute(s).`
    );
  }

  // --- Return cached token if still fresh ---
  if (cache?.token && cache?.obtainedAt && (now - cache.obtainedAt) < TOKEN_TTL_MS) {
    console.log(`[betfair-auth] Reusing cached token (age: ${Math.round((now - cache.obtainedAt) / 60000)}m)`);
    return { sessionToken: cache.token, appKey: APP_KEY };
  }

  // --- Login ---
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

  // --- Rate-limit / ban: engage circuit breaker ---
  if (data.error === "TEMPORARY_BAN_TOO_MANY_REQUESTS") {
    const bannedUntil = now + BAN_BACKOFF_MS;
    writeCache({ ...cache, bannedUntil });
    throw new Error(
      `Betfair login failed: TEMPORARY_BAN_TOO_MANY_REQUESTS – pausing logins for 15 minutes.`
    );
  }

  if (data.status !== "SUCCESS" || !data.token) {
    throw new Error(`Betfair login failed: ${data.error || JSON.stringify(data)}`);
  }

  // --- Cache the new token ---
  writeCache({ token: data.token, obtainedAt: now, bannedUntil: null });

  console.log("[betfair-auth] Login successful, session token cached to /tmp.");
  return { sessionToken: data.token, appKey: APP_KEY };
};

/**
 * Call this to force a fresh login on the next request (e.g. after a 401).
 * Preserves any active ban window.
 */
export const invalidateSession = () => {
  const cache = readCache();
  writeCache({ token: null, obtainedAt: null, bannedUntil: cache?.bannedUntil ?? null });
  console.log("[betfair-auth] Session token invalidated — will re-login on next request.");
};
