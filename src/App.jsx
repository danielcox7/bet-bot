import React, { useState, useEffect } from "react";
import { getTodayGreyhoundRaces } from "./services/betfair";

const App = () => {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRaces = async () => {
    setLoading(true);
    const data = await getTodayGreyhoundRaces();
    setRaces(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRaces();
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Dan Bet Bot</h1>
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
      </header>

      <main style={styles.content}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Today's Races</h2>
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
                {races.map((race) => (
                  <tr key={race.id} style={styles.tableRow}>
                    <td style={{ ...styles.tableCell, fontWeight: "bold" }}>
                      {race.time}
                    </td>
                    <td style={styles.tableCell}>{race.venue}</td>
                    <td style={styles.tableCell}>{race.name}</td>
                    <td style={styles.tableCell}>
                      <button style={styles.button}>Monitor</button>
                    </td>
                  </tr>
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
  header: { textAlign: "center", marginBottom: "3rem" },
  title: { fontSize: "2.5rem", fontWeight: "800", margin: "0 0 0.5rem 0" },
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
    marginTop: "0",
    borderBottom: "2px solid #f8f9fa",
    paddingBottom: "1rem",
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
    marginLeft: "10px",
    backgroundColor: "transparent",
    border: "1px solid #dee2e6",
    borderRadius: "4px",
    cursor: "pointer",
    padding: "2px 8px",
    fontSize: "1rem",
    color: "#6c757d",
  },
};

export default App;
