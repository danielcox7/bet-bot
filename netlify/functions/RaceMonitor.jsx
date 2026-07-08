import React, { useState, useEffect, useRef } from "react";
import { getMarketBook } from "./betfair";

const RaceMonitor = ({ marketId, raceName, runners }) => {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    color: "#666",
                    fontSize: "0.75rem",
                  }}
                >
                  MATCHED
                </th>
              </tr>
            </thead>
            <tbody>
              {marketData?.runners.map((runner) => {
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
                    style={{ borderBottom: "1px solid #eee" }}
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
                    <td
                      style={{
                        padding: "12px",
                        textAlign: "right",
                        color: "#888",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      £{Math.round(runner.totalMatched || 0).toLocaleString()}
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
