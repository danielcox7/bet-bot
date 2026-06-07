import React from "react";

const App = () => {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Dan Bet Bot</h1>
        <p style={styles.status}>
          System Status: <span style={styles.online}>Online</span>
        </p>
      </header>

      <main style={styles.content}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Market Monitor</h2>
          <p style={styles.placeholderText}>
            Infrastructure ready. Waiting for API integration to stream odds...
          </p>
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
};

export default App;
