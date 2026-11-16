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
import { getGreyhoundRaces, getMarketBook, getGreyhoundForm } from "./services/betfair";
import RaceMonitor from "./services/RaceMonitor";
import logo from "./assets/bet_bot_logo.jpg";
import packageJson from "../package.json";

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
      const stored = localStorage.getItem("betbot_qualified_races");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [autoLayEnabled, setAutoLayEnabled] = useState(() => JSON.parse(localStorage.getItem("betbot_autoLayEnabled") || "false"));
  const [maxLoss, setMaxLoss] = useState(() => parseFloat(localStorage.getItem("betbot_maxLoss") || "10"));
  const [simulationMode, setSimulationMode] = useState(() => JSON.parse(localStorage.getItem("betbot_simulationMode") || "true"));


const handleAutoLayEnabledToggle = (val) => {
    setAutoLayEnabled(val);
    localStorage.setItem("betbot_autoLayEnabled", JSON.stringify(val));
  };

  const handleMaxLossChange = (val) => {
    const num = parseFloat(val);
    setMaxLoss(val);
    if (!isNaN(num) && num > 0) {
      localStorage.setItem("betbot_maxLoss", num.toString());
    }
  };

  const handleSimulationModeChange = (val) => {
    setSimulationMode(val);
    localStorage.setItem("betbot_simulationMode", JSON.stringify(val));
  };

  const [showQualifiedOnly, setShowQualifiedOnly] = useState(false);
  const [formData, setFormData] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [showTrap1CDOnly, setShowTrap1CDOnly] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("betbot_show_trap1_cd_only") || "false");
    } catch (e) {
      return false;
    }
  });

  const handleToggleTrap1CD = (val) => {
    setShowTrap1CDOnly(val);
    try {
      localStorage.setItem("betbot_show_trap1_cd_only", JSON.stringify(val));
    } catch (e) {
      console.error("Error saving Trap 1 CD toggle:", e);
    }
  };

  const [showTrap1WonOnly, setShowTrap1WonOnly] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("betbot_show_trap1_won_only") || "false");
    } catch (e) {
      return false;
    }
  });

  const handleToggleTrap1Won = (val) => {
    setShowTrap1WonOnly(val);
    try {
      localStorage.setItem("betbot_show_trap1_won_only", JSON.stringify(val));
    } catch (e) {
      console.error("Error saving Trap 1 Won toggle:", e);
    }
  };

  const [showCoreStrategyOnly, setShowCoreStrategyOnly] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("betbot_show_core_strategy") || "false");
    } catch (e) {
      return false;
    }
  });

  const handleToggleCoreStrategy = (val) => {
    setShowCoreStrategyOnly(val);
    try {
      localStorage.setItem("betbot_show_core_strategy", JSON.stringify(val));
    } catch (e) {
      console.error("Error saving Core Strategy toggle:", e);
    }
  };
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
    const isCurrentlyQualified = qualifiedRaces.includes(raceId);
    
    if (isCurrentlyQualified) {
      setQualifiedRaces((prev) => prev.filter((id) => id !== raceId));
      // Remove any pending flags if we un-qualify
      localStorage.removeItem(`betbot_alert_sent_${raceId}`);
      return;
    }

    setQualifiedRaces((prev) => [...prev, raceId]);
    // Note: We no longer send the immediate notification/bet here.
    // The polling loop below will handle it when the race is 2 mins away.
  };

  // Monitor qualified races and trigger 2 minutes before start
  useEffect(() => {
    if (!races || races.length === 0 || qualifiedRaces.length === 0) return;

    const intervalId = setInterval(() => {
      const now = new Date();
      
      qualifiedRaces.forEach(async (raceId) => {
        // Skip if already alerted/processed
        if (localStorage.getItem(`betbot_alert_sent_${raceId}`)) return;

        const race = races.find(r => r.id === raceId);
        if (!race) return;

        // Parse race.time (e.g. 11:42 AM or 18:30)
        const m = race.time.match(/(\d+):(\d+)\s*([AP]M)?/i);
        if (!m) return;

        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        const meridiem = m[3];
        if (meridiem) {
          const isPM = meridiem.toUpperCase() === 'PM';
          if (hour === 12) hour = isPM ? 12 : 0;
          else if (isPM) hour += 12;
        }
        
        const raceStartTime = new Date(now);
        raceStartTime.setHours(hour, minute, 0, 0);

        const diffMs = raceStartTime - now;
        const diffMinutes = Math.floor(diffMs / 60000);

        // Check if race is exactly 0-2 minutes away
        if (diffMinutes >= 0 && diffMinutes <= 2) {
          localStorage.setItem(`betbot_alert_sent_${raceId}`, 'true');

          let msg = `🚨 Qualified Race Starting Soon: ${race.time} ${race.venue}\n`;
          const trap2 = race.runners?.find(r => r.runnerName.match(/^2\.\s/));
          
          if (autoLayEnabled && trap2) {
            if (simulationMode) {
              msg += `\n🧪 [SIMULATION] Auto-LAY Triggered for Trap 2 (${trap2.runnerName})\nMax Loss: £${maxLoss}`;
            } else {
              msg += `\n🚀 [LIVE] Placing Auto-LAY for Trap 2 (${trap2.runnerName})\nMax Loss: £${maxLoss}`;
              try {
                const res = await fetch("/api/place-sp-bet", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    marketId: race.id,
                    selectionId: trap2.selectionId,
                    maxLoss: maxLoss
                  })
                });
                if (!res.ok) {
                  msg += `\n❌ Bet Placement Failed: ${res.statusText}`;
                } else {
                  msg += `\n✅ Bet Placed Successfully!`;
                }
              } catch (err) {
                msg += `\n❌ Bet Placement Error: ${err.message}`;
              }
            }
          } else if (autoLayEnabled && !trap2) {
            msg += `\n⚠️ Auto-LAY Failed: Trap 2 not found in this race.`;
          }

          await sendTelegramAlert(msg);
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [races, qualifiedRaces, autoLayEnabled, maxLoss, simulationMode]);

  useEffect(() => {
    try {
      localStorage.setItem('betbot_qualified_races', JSON.stringify(qualifiedRaces));
    } catch (e) {
      console.error('Error saving qualified races to localStorage:', e);
    }
  }, [qualifiedRaces]);

// Removed old 5-second polling loop for Green strategy
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

  // Fetch Trap 1 form from GBGB whenever races are loaded
  useEffect(() => {
    if (!races || races.length === 0) return;

    let isMounted = true;
    const fetchForm = async () => {
      try {
        setFormLoading(true);
        const racePayload = races
          .map((r) => {
            const trap1 = r.runners?.find((runner) => runner.runnerName.match(/^1\.\s/));
            const trap2 = r.runners?.find((runner) => runner.runnerName.match(/^2\.\s/));
            return {
              id: r.id,
              trap1Dog: trap1?.runnerName || "",
              trap2Dog: trap2?.runnerName || "",
              venue: r.venue,
              distance: r.distance || r.name,
            };
          })
          .filter((r) => r.trap1Dog);

        if (racePayload.length > 0) {
          const formResults = await getGreyhoundForm(racePayload);
          if (isMounted && formResults) {
            setFormData(formResults);
          }
        }
      } catch (err) {
        console.error("Error fetching Trap 1 form:", err);
      } finally {
        if (isMounted) setFormLoading(false);
      }
    };

    fetchForm();
    return () => {
      isMounted = false;
    };
  }, [races]);

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
    <div style={styles.container} className="app-container">
      <header style={styles.header}>
        <img src={logo} alt="Bet Bot Logo" style={styles.logo} />
        <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem" }}>
          Bet Bot <span style={{ fontSize: "0.85rem", color: "#6c757d", fontWeight: "600", backgroundColor: "#e9ecef", padding: "2px 8px", borderRadius: "12px", marginLeft: "6px" }}>v{packageJson.version}</span>
        </h1>
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
        <div style={{ display: "flex", gap: "1rem" }}>
          <button onClick={() => sendTelegramAlert('Test Telegram alert from Bet Bot')} style={styles.button}>Test Telegram</button>
        </div>
        
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          backgroundColor: "#fff",
          padding: "0.75rem 1.25rem",
          borderRadius: "10px",
          marginTop: "1rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #e2e8f0"
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", fontSize: "0.9rem", cursor: "pointer" }}>
            <span>Auto-LAY (SP):</span>
            <input
              type="checkbox"
              checked={autoLayEnabled}
              onChange={(e) => handleAutoLayEnabledToggle(e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: "600" }}>
            Max Loss (£):
            <input
              type="number"
              min="1"
              max="100"
              value={maxLoss}
              onChange={(e) => handleMaxLossChange(e.target.value)}
              style={{ width: "60px", padding: "4px 6px", borderRadius: "4px", border: "1px solid #ccc", textAlign: "center", fontWeight: "bold" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: "600" }}>
            Mode:
            <select
              value={simulationMode ? "test" : "live"}
              onChange={(e) => handleSimulationModeChange(e.target.value === "test")}
              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc", fontWeight: "bold", backgroundColor: simulationMode ? "#fff3cd" : "#d1e7dd" }}
            >
              <option value="test">🧪 Test / Simulation</option>
              <option value="live">🚀 Live Money</option>
            </select>
          </label>
        </div>
      </header>

      <main style={styles.content}>
        <section style={styles.card} className="app-card">
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
            <label
              style={{
                ...styles.checkboxLabel,
                backgroundColor: showTrap1CDOnly ? "#d1e7dd" : "#fff",
                color: showTrap1CDOnly ? "#0f5132" : "#333",
                border: showTrap1CDOnly ? "1px solid #198754" : "1px solid #ccc",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <input
                type="checkbox"
                checked={showTrap1CDOnly}
                onChange={(e) => handleToggleTrap1CD(e.target.checked)}
                style={styles.checkbox}
              />
              🏆 Trap 1 C&D Winner {formLoading ? "(Loading...)" : ""}
            </label>
            <label
              style={{
                ...styles.checkboxLabel,
                backgroundColor: showTrap1WonOnly ? "#cff4fc" : "#fff",
                color: showTrap1WonOnly ? "#055160" : "#333",
                border: showTrap1WonOnly ? "1px solid #0dcaf0" : "1px solid #ccc",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <input
                type="checkbox"
                checked={showTrap1WonOnly}
                onChange={(e) => handleToggleTrap1Won(e.target.checked)}
                style={styles.checkbox}
              />
              🎯 Trap 1 Won Last {formLoading ? "(Loading...)" : ""}
            </label>
            <label
              style={{
                ...styles.checkboxLabel,
                backgroundColor: showCoreStrategyOnly ? "#fff3cd" : "#fff",
                color: showCoreStrategyOnly ? "#856404" : "#333",
                border: showCoreStrategyOnly ? "1px solid #ffc107" : "1px solid #ccc",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <input
                type="checkbox"
                checked={showCoreStrategyOnly}
                onChange={(e) => handleToggleCoreStrategy(e.target.checked)}
                style={styles.checkbox}
              />
              ⚡ T1 Won + T2 &gt;4 {formLoading ? "(Loading...)" : ""}
            </label>
          </div>
          {loading ? (
            <p style={styles.placeholderText}>
              Connecting to Betfair Exchange...
            </p>
          ) : races.length > 0 ? (
            <div className="table-wrapper" style={{ width: "100%", overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Time</th>
                    <th style={styles.tableHeader}>Venue</th>
                    <th style={styles.tableHeader}>Market</th>
                    <th style={styles.tableHeader}>Trap 1 Form</th>
                    <th style={styles.tableHeader}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {races
                      .filter((race) => {
                        // basic filters
                        if (selectedTrack !== "ALL" && race.venue !== selectedTrack) return false;
                        if (showQualifiedOnly && !qualifiedRaces.includes(race.id)) return false;
                        if (showTrap1CDOnly && !formData[race.id]?.isCDWinner) return false;
                        if (showTrap1WonOnly && !formData[race.id]?.trap1Won) return false;
                        if (showCoreStrategyOnly && !formData[race.id]?.qualifies) return false;
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
                      <tr 
                        style={qualifiedRaces.includes(race.id) ? { ...styles.tableRow, ...styles.qualifiedRow, cursor: "pointer" } : { ...styles.tableRow, cursor: "pointer" }}
                        onClick={() => toggleQualified(race.id)}
                      >
                        <td style={{ ...styles.tableCell, fontWeight: "bold" }}>
                          {race.time}
                        </td>
                        <td style={styles.tableCell}>{race.venue}</td>
                        <td style={styles.tableCell}>{race.name}</td>
                        <td style={styles.tableCell}>
                          {formData[race.id]?.isCDWinner ? (
                            <span
                              style={{
                                backgroundColor: "#d1e7dd",
                                color: "#0f5132",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                                fontWeight: "bold",
                                border: "1px solid #badbcc",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              🏆 C&D Winner ({formData[race.id].lastRace?.track} {formData[race.id].lastRace?.dist}m)
                            </span>
                          ) : formData[race.id]?.lastRace ? (
                            <span
                              style={{
                                backgroundColor: "#f8f9fa",
                                color: "#6c757d",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                border: "1px solid #e9ecef",
                              }}
                            >
                              {formData[race.id].lastRace.pos === 1
                                ? `Won (${formData[race.id].lastRace.track} ${formData[race.id].lastRace.dist}m)`
                                : `${formData[race.id].lastRace.pos}th (${formData[race.id].lastRace.track} ${formData[race.id].lastRace.dist}m)`}
                            </span>
                          ) : formLoading ? (
                            <span style={{ color: "#adb5bd", fontSize: "0.75rem", fontStyle: "italic" }}>loading...</span>
                          ) : (
                            <span style={{ color: "#ced4da" }}>-</span>
                          )}
                        </td>
                        <td style={styles.tableCell}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              style={styles.button}
                              onClick={(e) => {
                                e.stopPropagation(); // prevent toggling qualification
                                handleMonitorClick(race.id);
                              }}
                            >
                              {monitoringMarketId === race.id
                                ? "Close Monitor"
                                : "Monitor"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {monitoringMarketId === race.id && (
                        <tr style={styles.monitorRow}>
                          <td colSpan="5" style={styles.monitorCell}>
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
            </div>
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
     backgroundColor: "#eafae8",
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
