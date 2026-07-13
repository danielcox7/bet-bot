/**
 * Shared Betfair authentication helper.
 * Logs in with username + password and returns a fresh session token.
 * Used by all Netlify functions so we never rely on a hardcoded / expired token.
 */
export const getBetfairSession = async () => {
  const APP_KEY = process.env.BETFAIR_APP_KEY;
  const USERNAME = process.env.BETFAIR_USERNAME;
  const PASSWORD = process.env.BETFAIR_PASSWORD;

  if (!APP_KEY || !USERNAME || !PASSWORD) {
    throw new Error(
      "Missing Betfair credentials: BETFAIR_APP_KEY, BETFAIR_USERNAME and BETFAIR_PASSWORD must all be set."
    );
  }

  const params = new URLSearchParams({ username: USERNAME, password: PASSWORD });

  const response = await fetch(
    "https://identitysso.betfair.com/api/login",
    {
      method: "POST",
      headers: {
        "X-Application": APP_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Betfair login HTTP error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // Betfair returns { status: "SUCCESS", token: "...", error: "" } on success
  if (data.status !== "SUCCESS" || !data.token) {
    throw new Error(`Betfair login failed: ${data.error || JSON.stringify(data)}`);
  }

  console.log("[betfair-auth] Login successful, fresh session token obtained.");
  return { sessionToken: data.token, appKey: APP_KEY };
};
