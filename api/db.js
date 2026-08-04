import { readFileSync, writeFileSync } from "fs";

const STATE_KEY = "betbot_state";
const LOCAL_TMP_FILE = "/tmp/betbot_state.json";

const DEFAULT_STATE = {
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

function getRedisCredentials() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  }
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }
  if (process.env.REDIS_REST_API_URL && process.env.REDIS_REST_API_TOKEN) {
    return { url: process.env.REDIS_REST_API_URL, token: process.env.REDIS_REST_API_TOKEN };
  }
  if (process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      const host = parsed.hostname;
      const password = parsed.password || (parsed.username !== "default" ? parsed.username : null);
      if (host && password) {
        return {
          url: `https://${host}`,
          token: password,
        };
      }
    } catch (e) {
      console.error("[db] Error parsing REDIS_URL:", e.message);
    }
  }
  return null;
}

export async function readState() {
  const creds = getRedisCredentials();

  if (creds?.url && creds?.token) {
    try {
      const res = await fetch(`${creds.url}/get/${STATE_KEY}`, {
        headers: { Authorization: `Bearer ${creds.token}` },
      });
      if (res.ok) {
        const json = await res.json();
        let raw = json.result;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          console.log("[db] Successfully read state from Redis.");
          return { ...DEFAULT_STATE, ...parsed };
        }
      } else {
        console.error("[db] Redis GET response not OK:", res.status, await res.text());
      }
    } catch (err) {
      console.error("[db] Redis read error:", err.message);
    }
  }

  const jsonbinKey = process.env.JSONBIN_SECRET_KEY;
  const jsonbinBin = process.env.JSONBIN_BIN_ID;
  if (jsonbinKey && jsonbinBin) {
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${jsonbinBin}/latest`, {
        headers: { "X-Master-Key": jsonbinKey },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.record) {
          console.log("[db] Successfully read state from JSONBin.");
          return { ...DEFAULT_STATE, ...json.record };
        }
      }
    } catch (err) {
      console.error("[db] JSONBin read error:", err.message);
    }
  }

  // Fallback to local /tmp file
  try {
    const data = readFileSync(LOCAL_TMP_FILE, "utf8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state) {
  const creds = getRedisCredentials();

  if (creds?.url && creds?.token) {
    try {
      const res = await fetch(`${creds.url}/set/${STATE_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(state)),
      });
      if (res.ok) {
        console.log("[db] Successfully saved state to Redis.");
      } else {
        console.error("[db] Redis SET response not OK:", res.status, await res.text());
      }
    } catch (err) {
      console.error("[db] Redis save error:", err.message);
    }
  }

  const jsonbinKey = process.env.JSONBIN_SECRET_KEY;
  const jsonbinBin = process.env.JSONBIN_BIN_ID;
  if (jsonbinKey && jsonbinBin) {
    try {
      await fetch(`https://api.jsonbin.io/v3/b/${jsonbinBin}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": jsonbinKey,
        },
        body: JSON.stringify(state),
      });
    } catch (err) {
      console.error("[db] JSONBin save error:", err.message);
    }
  }

  // Always write local /tmp file as well
  try {
    writeFileSync(LOCAL_TMP_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("[db] Failed to write local tmp file:", e.message);
  }
}
