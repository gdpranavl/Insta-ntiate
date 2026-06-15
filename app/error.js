"use client";

export default function Error({ error, reset }) {
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 24px", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: "#6b6b6b", lineHeight: 1.6 }}>
        The dashboard hit an unexpected error{error?.message ? `: ${error.message}` : "."} This is usually a
        malformed archive — try again, or reload the demo data.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 16,
          padding: "10px 18px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.2)",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
