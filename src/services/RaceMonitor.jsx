import React, { useState, useEffect } from "react";
import { getMarketBook } from "./betfair";

const RaceMonitor = ({ marketId, raceName, runners }) => {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualOdds, setManualOdds] = useState(() => {
    try {
      const stored = localStorage.getItem(`betbot_odds_${marketId}`);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Error reading manual odds from localStorage:", e);
      return {};
    }
  });

  const handleOddsChange = (selectionId, val) => {
    // Allow clearing the input
    if (val === "") {
      setManualOdds((prev) => {
        const updated = { ...prev, [selectionId]: "" };
        try {
          localStorage.setItem(`betbot_odds_${marketId}`, JSON.stringify(updated));
        } catch (e) {
          console.error("Error saving manual odds to localStorage:", e);
        }
        return updated;
      });
      return;
    }

    // Convert fractional odds (e.g., "9/2") to decimal odds
    let processed = val.trim();
    // Store the raw value (fractional or decimal) directly
    setManualOdds((prev) => {
      const updated = { ...prev, [selectionId]: val };
      try {
        localStorage.setItem(`betbot_odds_${marketId}`, JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving manual odds to localStorage:", e);
      }
      return updated;
    });
  };

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

  const [selectedTrap, setSelectedTrap] = useState(() => {
    try {
      return localStorage.getItem("betbot_selected_trap") || "ALL";
    } catch (e) {
      console.error("Error reading selected trap from localStorage:", e);
      return "ALL";
    }
  });

  const handleTrapChange = (val) => {
    setSelectedTrap(val);
    try {
      localStorage.setItem("betbot_selected_trap", val);
    } catch (e) {
      console.error("Error saving selected trap to localStorage:", e);
    }
  };

  useEffect(() => {
    let intervalId;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const data = await getMarketBook(marketId);
        setMarketData(data);
        setError(null); // Clear errors on a successful fetch
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Poll every 5 seconds for live updates
    intervalId = setInterval(fetchData, 5000);

    return () => clearInterval(intervalId);
  }, [marketId]);

  return (
    <div
      className="race-monitor"
      style={{
        width: "100%",
        padding: "20px",
        boxSizing: "border-box",
        borderTop: "2px solid #0052cc",
        background: "#fff",
        boxShadow: "inset 0 2px 10px rgba(0,0,0,0.05)",
      }}
    >
      {loading && !marketData ? (
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            color: "#666",
            fontStyle: "italic",
          }}
        >
          Loading live market data...
        </div>
      ) : error ? (
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            color: "#d93025",
            fontWeight: "bold",
          }}
        >
          Error: {error}
        </div>
      ) : (
        <>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#333" }}>
              Live Market: {raceName}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <select
                value={selectedTrap}
                onChange={(e) => handleTrapChange(e.target.value)}
                style={{
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
                }}
              >
                <option value="ALL">All Traps</option>
                <option value="1">Trap 1</option>
                <option value="2">Trap 2</option>
                <option value="3">Trap 3</option>
                <option value="4">Trap 4</option>
                <option value="5">Trap 5</option>
                <option value="6">Trap 6</option>
              </select>
              <span
                className="status-badge"
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  background:
                    marketData?.status === "OPEN" ? "#e6f4ea" : "#feebec",
                  color: marketData?.status === "OPEN" ? "#1e7e34" : "#d93025",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                }}
              >
                {marketData?.status}
              </span>
            </div>
          </header>

          <table
            className="market-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #eee",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f8f9fa",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    color: "#666",
                    fontSize: "0.75rem",
                    width: "50px",
                  }}
                >
                  TRAP
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    color: "#666",
                    fontSize: "0.75rem",
                  }}
                >
                  DOG NAME
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#666",
                    fontSize: "0.75rem",
                  }}
                >
                  LAST TRADED
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#666",
                    fontSize: "0.75rem",
                    width: "90px",
                  }}
                >
                  RP SP
                </th>
                <th
                  className="back-cell"
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    background: "#bbd9fe",
                    width: "100px",
                    color: "#0052cc",
                    fontSize: "0.75rem",
                  }}
                >
                  BACK
                </th>
                <th
                  className="lay-cell"
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    background: "#f9d9e5",
                    width: "100px",
                    color: "#c1005b",
                    fontSize: "0.75rem",
                  }}
                >
                  LAY
                </th>
              </tr>
            </thead>
            <tbody>
              {marketData?.runners
                .filter((runner) => {
                  if (selectedTrap === "ALL") return true;
                  const staticInfo = runners?.find(
                    (r) => r.selectionId === runner.selectionId,
                  );
                  const dogName = staticInfo
                    ? staticInfo.runnerName
                    : `Dog ${runner.selectionId}`;
                  const trapMatch = dogName.match(/^(\d+)\.\s+(.*)/);
                  const trapNumber = trapMatch ? trapMatch[1] : "—";
                  return trapNumber === selectedTrap;
                })
                .map((runner) => {
                  const staticInfo = runners?.find(
                  (r) => r.selectionId === runner.selectionId,
                );
                let dogName = staticInfo
                  ? staticInfo.runnerName
                  : `Dog ${runner.selectionId}`;

                let trapNumber = "—";
                const trapMatch = dogName.match(/^(\d+)\.\s+(.*)/);
                if (trapMatch) {
                  trapNumber = trapMatch[1];
                  dogName = trapMatch[2];
                }

                return (
                  <tr
                    key={runner.selectionId}
                    style={{
    borderBottom: "1px solid #eee",
    background: (
      manualOdds[runner.selectionId] &&
      (() => {
        const spDecimal = convertToDecimal(manualOdds[runner.selectionId]);
        const backPrice = runner.ex?.availableToBack?.[0]?.price ?? 0;
        return spDecimal !== null && backPrice - spDecimal >= 2;
      })()
    )
      ? "#e6ffe6"
      : (
        manualOdds[runner.selectionId] &&
        (() => {
          const spDecimal = convertToDecimal(manualOdds[runner.selectionId]);
          const backPrice = runner.ex?.availableToBack?.[0]?.price ?? 0;
          return spDecimal !== null && spDecimal > backPrice;
        })()
      )
        ? "#ffe5e5"
        : "transparent"
  }}
                  >
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "#333",
                          color: "#fff",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          fontSize: "0.8rem",
                          fontWeight: "bold",
                        }}
                      >
                        {trapNumber}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: "600" }}>
                      {dogName}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        textAlign: "center",
                        color: "#444",
                        fontWeight: "bold",
                      }}
                    >
                      {runner.lastPriceTraded
                        ? runner.lastPriceTraded.toFixed(2)
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <select
                        value={manualOdds[runner.selectionId] || ""}
                        onChange={(e) =>
                          handleOddsChange(runner.selectionId, e.target.value)
                        }
                        style={{
                          width: "80px",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "1px solid #dcdcdc",
                          textAlign: "center",
                          fontWeight: "bold",
                          fontSize: "0.9rem",
                          outline: "none",
                          backgroundColor: "#fff",
                          color: "#333",
                          transition: "border-color 0.2s, box-shadow 0.2s",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#0052cc";
                          e.target.style.boxShadow = "0 0 0 2px rgba(0, 82, 204, 0.15)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "#dcdcdc";
                          e.target.style.boxShadow = "none";
                        }}
                      >
                        <option value="">—</option>
                        {[
                           "4/1",
                           "9/2",
                           "5/1",
                           "11/2",
                           "6/1",
                           "7/1",
                           "13/2",
                           "8/1",
                           "9/1",
                           "10/1",
                           "11/1",
                           "12/1",
                           "13/1",
                           "14/1",
                           "15/1",
                           "16/1",
                           "17/1",
                           "18/1",
                           "19/1",
                           "20/1",
                        ].map((od) => (
                          <option key={od} value={od}>
                            {od}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className="back-cell price"
                      style={{
                        padding: "6px",
                        textAlign: "center",
                        background: "#f0f7ff",
                        borderLeft: "1px solid #bbd9fe",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "1.1rem",
                          color: "#0052cc",
                        }}
                      >
                        {runner.ex?.availableToBack?.[0]?.price?.toFixed(2) ||
                          "—"}
                      </div>
                      <small
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "#666",
                        }}
                      >
                        {runner.ex?.availableToBack?.[0]?.size
                          ? `£${Math.round(runner.ex.availableToBack[0].size)}`
                          : ""}
                      </small>
                    </td>
                    <td
                      className="lay-cell price"
                      style={{
                        padding: "6px",
                        textAlign: "center",
                        background: "#fff0f5",
                        borderLeft: "1px solid #f9d9e5",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "1.1rem",
                          color: "#c1005b",
                        }}
                      >
                        {runner.ex?.availableToLay?.[0]?.price?.toFixed(2) ||
                          "—"}
                      </div>
                      <small
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "#666",
                        }}
                      >
                        {runner.ex?.availableToLay?.[0]?.size
                          ? `£${Math.round(runner.ex.availableToLay[0].size)}`
                          : ""}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div
        className="monitor-footer"
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "space-between",
          color: "#999",
          fontSize: "0.75rem",
        }}
      >
        <span>Market ID: {marketId}</span>
        <span>Auto-refreshing every 5s</span>
      </div>
    </div>
  );
};

export default RaceMonitor;
