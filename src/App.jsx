import React, { useState, useEffect } from "react";

// Convert a fractional or decimal odd string to a decimal number
const convertToDecimal = (oddStr) => {
  if (!oddStr) return null;
  const trimmed = oddStr.trim();
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
};
import { getGreyhoundRaces, getMarketBook } from "./services/betfair";
import RaceMonitor from "./services/RaceMonitor";
import logo from "./assets/bet_bot_logo.jpg";

const App = () => {
  // Telegram configuration from environment variables
  const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;
  console.log('Telegram config:', { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID });

  // Helper to send a message via Telegram Bot API
  const sendTelegramAlert = async (message) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('Telegram credentials are missing');
      return;
    }
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
      console.log('Sending Telegram message:', url);
      const response = await fetch(url);
      if (!response.ok) {
        const errText = await response.text();
        console.error('Telegram API error:', response.status, errText);
      } else {
        console.log('Telegram message sent successfully');
      }
    } catch (err) {
      console.error('Failed to send Telegram alert:', err);
    }
  };
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monitoringMarketId, setMonitoringMarketId] = useState(null); // Changed state to store marketId
  const [qualifiedRaces, setQualifiedRaces] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem("betbot_qualified_races")) || [];
  } catch (e) {
    console.error("Error reading qualified races from localStorage:", e);
    return [];
  }
});
const [showQualifiedOnly, setShowQualifiedOnly] = useState(false);
  // Auto‑bet toggle state (persisted)
  const [autoBetEnabled, setAutoBetEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('betbot_autobet_enabled')) || false;
    } catch (e) {
      console.error('Error reading autobet flag from localStorage:', e);
      return false;
    }
  });

   const toggleQualified = async (raceId) => {
     const race = races.find((r) => r.id === raceId);
     try {
       const market = await getMarketBook(raceId);
       const stored = localStorage.getItem(`betbot_odds_${raceId}`);
       const manualOdds = stored ? JSON.parse(stored) : {};

       let isGreen = false;
       let qualifyingInfo = null;
       market?.runners?.forEach((runner) => {
         const sp = convertToDecimal(manualOdds[runner.selectionId]);
         const back = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
         const diff = back - sp;
         console.log(`Manual toggle – Runner ${runner.selectionId}: SP=${sp}, Back=${back}, Diff=${diff}`);
         if (sp !== null && back && diff >= 2) {
           isGreen = true;
           if (!qualifyingInfo) {
             const staticInfo = race.runners?.find((r) => r.selectionId === runner.selectionId);
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

          // Toggle qualification state
          if (qualifiedRaces.includes(raceId)) {
            // Remove from qualified list
            setQualifiedRaces((prev) => prev.filter((id) => id !== raceId));
          } else {
            // Add to qualified list
            setQualifiedRaces((prev) => [...prev, raceId]);
            // Send immediate Telegram alert only when green
            if (isGreen) {
              let message = race
                ? `✅ Qualified race (green) detected: ${race.name} at ${race.time} (${race.venue})`
                : `✅ Race ID ${raceId} qualified (green)`;
              if (qualifyingInfo) {
                message += ` – Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}`;
              }
              await sendTelegramAlert(message);
            }
          }
     } catch (err) {
       console.error('Error evaluating green criteria for manual qualification:', err);
     }
   };
useEffect(() => {
  try {
    localStorage.setItem('betbot_qualified_races', JSON.stringify(qualifiedRaces));
  } catch (e) {
    console.error('Error saving qualified races to localStorage:', e);
  }
}, [qualifiedRaces]);

// Periodically check qualified races for green condition and send alert if not yet sent
useEffect(() => {
  const intervalId = setInterval(() => {
    qualifiedRaces.forEach(async (raceId) => {
      if (localStorage.getItem(`betbot_alert_sent_${raceId}`)) return;
      try {
        const race = races.find((r) => r.id === raceId);
        const market = await getMarketBook(raceId);
        const stored = localStorage.getItem(`betbot_odds_${raceId}`);
        const manualOdds = stored ? JSON.parse(stored) : {};
        let isGreen = false;
        // Determine if any runner meets green criteria and capture trap/dog info
        let qualifyingInfo = null;
        market?.runners?.forEach((runner) => {
          const sp = convertToDecimal(manualOdds[runner.selectionId]);
          const back = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
          const diff = back - sp;
          console.log(`Periodic check - Runner ${runner.selectionId}: SP=${sp}, Back=${back}, Diff=${diff}`);
          if (sp !== null && back && diff >= 2) {
            isGreen = true;
            if (!qualifyingInfo) {
              const staticInfo = race?.runners?.find((r) => r.selectionId === runner.selectionId);
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
          // Auto‑qualify the race if not already qualified
          if (!qualifiedRaces.includes(raceId)) {
            setQualifiedRaces((prev) => {
              const updated = new Set([...prev, raceId]);
              return Array.from(updated);
            });
          }
          // Build base message
          let message = race
            ? `✅ Qualified race (green) detected: ${race.name} at ${race.time} (${race.venue})`
            : `✅ Race ID ${raceId} qualified (green)`;
          // Append trap and dog name if captured
          if (qualifyingInfo) {
            message += ` – Trap ${qualifyingInfo.trapNumber}, ${qualifyingInfo.dogName}`;
          }
          await sendTelegramAlert(message);
          localStorage.setItem(`betbot_alert_sent_${raceId}`, 'true');
        }

      } catch (err) {
        console.error('Error checking pending alerts:', err);
      }
    });
  }, 60000); // Poll every 60s — Betfair rate-limits logins if called too frequently
  return () => clearInterval(intervalId);
}, [qualifiedRaces, races]);
const [selectedTrap, setSelectedTrap] = useState(() => {

    try {
      return localStorage.getItem("betbot_selected_trap") || "ALL";
    } catch (e) {
      console.error("Error reading selected trap from localStorage:", e);
      return "ALL";
    }
  });

  const [selectedTrack, setSelectedTrack] = useState(() => {
    try {
      return localStorage.getItem("betbot_selected_track") || "ALL";
    } catch (e) {
      console.error("Error reading selected track from localStorage:", e);
      return "ALL";
    }
  });

  const handleTrackChange = (val) => {
    setSelectedTrack(val);
    try {
      localStorage.setItem("betbot_selected_track", val);
    } catch (e) {
      console.error("Error saving selected track to localStorage:", e);
    }
  };
  const handleTrapChange = (val) => {
    setSelectedTrap(val);
    try {
      localStorage.setItem("betbot_selected_trap", val);
    } catch (e) {
      console.error("Error saving selected trap to localStorage:", e);
    }
  };

  const fetchRaces = async () => {
    // Close any open monitors when refreshing the race list
    setMonitoringMarketId(null);
    setLoading(true);
    const data = await getGreyhoundRaces();
    setRaces(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRaces();
  }, []);

// --- Automatic daily cleanup of stale localStorage entries ---
useEffect(() => {
  if (!races?.length) return;

  // Set of current race IDs
  const todayIds = new Set(races.map((r) => r.id));

  // Helper to delete keys with a given prefix that are not for today
  const cleanKey = (prefix) => {
    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith(prefix)) return;
      const id = key.replace(prefix, "");
      if (!todayIds.has(id)) {
        console.log('Cleaning stale localStorage key:', key);
        localStorage.removeItem(key);
      }
    });
  };

  // Clean odds and alert flags for completed races
  cleanKey('betbot_odds_');
  cleanKey('betbot_alert_sent_');

  // Reset qualified races once per calendar day
  const lastClear = localStorage.getItem('betbot_last_clear');
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (lastClear !== today) {
    console.log('Resetting qualified races for a new day');
    localStorage.setItem('betbot_qualified_races', JSON.stringify([]));
    localStorage.setItem('betbot_last_clear', today);
    setQualifiedRaces([]);
  }
}, [races]);

  const handleMonitorClick = (raceId) => {
    setMonitoringMarketId((prevId) => (prevId === raceId ? null : raceId)); // Toggle monitor
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <img src={logo} alt="Bet Bot Logo" style={styles.logo} />
        <p style={styles.status}>
          Greyhound Markets:{" "}
          <span style={styles.online}>{loading ? "Syncing..." : "Live"}</span>
          <button
            onClick={fetchRaces}
            style={styles.refreshButton}
            disabled={loading}
          >
            {loading ? "..." : "↻"}
          </button>
        </p>
        <button onClick={() => sendTelegramAlert('Test Telegram alert from Bet Bot')} style={styles.button}>Test Telegram</button>
      </header>

      <main style={styles.content}>
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Today's Races</h2>
          </div>
          <div style={styles.filterBar}>
            <select
              value={selectedTrack}
              onChange={(e) => handleTrackChange(e.target.value)}
              style={styles.trackFilter}
            >
              <option value="ALL">All Venues</option>
              {Array.from(new Set(races.map((race) => race.venue))).map((venue) => (
                <option key={venue} value={venue}>{venue}</option>
              ))}
            </select>
            <select
              value={selectedTrap}
              onChange={(e) => handleTrapChange(e.target.value)}
              style={styles.trapFilter}
            >
              <option value="ALL">All Traps</option>
              <option value="1">Trap 1</option>
              <option value="2">Trap 2</option>
              <option value="3">Trap 3</option>
              <option value="4">Trap 4</option>
              <option value="5">Trap 5</option>
              <option value="6">Trap 6</option>
            </select>
                      <span style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showQualifiedOnly}
                onChange={() => setShowQualifiedOnly(prev => !prev)}
                style={styles.checkbox}
              />
              Show Qualified Only
            </span>
          </div>
          {loading ? (
            <p style={styles.placeholderText}>
              Connecting to Betfair Exchange...
            </p>
          ) : races.length > 0 ? (
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.tableHeader}>Time</th>
                  <th style={styles.tableHeader}>Venue</th>
                  <th style={styles.tableHeader}>Market</th>
                  <th style={styles.tableHeader}>Action</th>
                </tr>
              </thead>
              <tbody>
                {races
                    .filter((race) => {
                      // basic filters
                      if (selectedTrack !== "ALL" && race.venue !== selectedTrack) return false;
                      if (showQualifiedOnly && !qualifiedRaces.includes(race.id)) return false;
                      // time filter – exclude races that have already started/passed
                      const now = new Date();
                      const nowMins = now.getHours() * 60 + now.getMinutes();
                      const m = race.time.match(/(\d+):(\d+)\s*([AP]M)?/i);
                      if (!m) return true; // keep if format unknown
                      let hour = parseInt(m[1], 10);
                      const minute = parseInt(m[2], 10);
                      const meridiem = m[3];
                      if (meridiem) {
                        const isPM = meridiem.toUpperCase() === "PM";
                        if (hour === 12) hour = isPM ? 12 : 0;
                        else if (isPM) hour += 12;
                      }
                      const raceMins = hour * 60 + minute;
                      return raceMins >= nowMins;
                    })
                  .sort((a, b) => {
                    const parseTime = (t) => {
                      const m = t.match(/(\d+):(\d+)\s*([AP]M)?/i);
                      if (!m) return 0;
                      let hour = parseInt(m[1], 10);
                      const minute = parseInt(m[2], 10);
                      const meridiem = m[3];
                      if (meridiem) {
                        const isPM = meridiem.toUpperCase() === 'PM';
                        if (hour === 12) hour = isPM ? 12 : 0;
                        else if (isPM) hour += 12;
                      }
                      return hour * 60 + minute;
                    };
                    return parseTime(a.time) - parseTime(b.time);
                  })
                  .map((race) => (
                  <React.Fragment key={race.id}>
                    <tr style={qualifiedRaces.includes(race.id) ? { ...styles.tableRow, ...styles.qualifiedRow } : styles.tableRow}>
                      <td style={{ ...styles.tableCell, fontWeight: "bold" }}>
                        {race.time}
                      </td>
                      <td style={styles.tableCell}>{race.venue}</td>
                      <td style={styles.tableCell}>{race.name}</td>
                      <td style={styles.tableCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            style={styles.button}
                            onClick={() => handleMonitorClick(race.id)}
                          >
                            {monitoringMarketId === race.id
                              ? "Close Monitor"
                              : "Monitor"}
                          </button>
                          <label style={styles.checkboxLabel} htmlFor={`qualified-${race.id}`}>
                            <input
                              id={`qualified-${race.id}`}
                              type="checkbox"
                              checked={qualifiedRaces.includes(race.id)}
                              onChange={() => toggleQualified(race.id)}
                              style={styles.checkbox}
                            />
                            Qualified
                          </label>
                        </div>
                      </td>
                    </tr>
                    {monitoringMarketId === race.id && (
                      <tr style={styles.monitorRow}>
                        <td colSpan="4" style={styles.monitorCell}>
                          <RaceMonitor
                            marketId={race.id}
                            raceName={race.name}
                            runners={race.runners}
                            selectedTrap={selectedTrap}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.placeholderText}>
              No greyhound races found for today.
            </p>
          )}
        </section>
      </main>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f8f9fa",
    color: "#212529",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "2rem",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    marginBottom: "3rem",
  },
  logo: {
    width: "120px",
    height: "120px",
    borderRadius: "24px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
    marginBottom: "1rem",
  },
  status: {
    fontSize: "0.9rem",
    color: "#6c757d",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  online: { color: "#198754", fontWeight: "bold" },
  content: { maxWidth: "900px", margin: "0 auto" },
  card: {
    backgroundColor: "#fff",
    padding: "2rem",
    borderRadius: "12px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
    border: "1px solid #e9ecef",
  },
  cardTitle: {
    margin: "0",
    marginTop: "0",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "2px solid #f8f9fa",
    paddingBottom: "1rem",
    marginBottom: "1rem",
  },
  trapFilter: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "0.85rem",
    fontWeight: "600",
    backgroundColor: "#fff",
    color: "#333",
    outline: "none",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  checkbox: {
    marginLeft: "0.5rem",
    cursor: "pointer",
  },
  checkboxLabel: {
    marginLeft: "0.25rem",
    fontSize: "0.85rem",
    color: "#212529",
    display: "flex",
    alignItems: "center",
   },
   qualifiedRow: {
     backgroundColor: "#e6f7ff",
   },
  trackFilter: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "0.85rem",
    fontWeight: "600",
    backgroundColor: "#fff",
    color: "#333",
    outline: "none",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  filterBar: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "1rem",
  },
  placeholderText: { color: "#adb5bd", fontStyle: "italic" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: "1rem" },
  tableHeaderRow: { textAlign: "left", borderBottom: "1px solid #dee2e6" },
  tableHeader: { padding: "12px", color: "#495057", fontWeight: "600" },
  tableRow: { borderBottom: "1px solid #f8f9fa" },
  tableCell: { padding: "12px", fontSize: "0.95rem" },
  button: {
    backgroundColor: "#0052cc",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  refreshButton: {
    // ... existing styles
  },
  monitorRow: {
    backgroundColor: "#e9f5ff", // Light blue background for monitored row
  },
  monitorCell: {
    padding: "0", // Remove padding as the inner component will handle it
    borderTop: "none", // Remove border as the inner component will handle it
    backgroundColor: "transparent", // Ensure background is transparent
  },
};

export default App;
