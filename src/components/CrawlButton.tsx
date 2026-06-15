"use client";

import { useState } from "react";

export default function CrawlButton() {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState("");

  async function startCrawl() {
    setMessage("Starting crawler...");

    const res = await fetch("/api/crawl", {
      method: "POST",
    });

    const data = await res.json();
    setMessage(data.message || "Done");
  }

  async function loadLog() {
    const res = await fetch("/api/crawl");
    const data = await res.json();
    setLog(data.log || "");
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={startCrawl}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #333",
          cursor: "pointer",
          marginRight: 8,
        }}
      >
        Crawl now
      </button>

      <button
        onClick={loadLog}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #333",
          cursor: "pointer",
        }}
      >
        Load log
      </button>

      {message && <p>{message}</p>}

      {log && (
        <pre
          style={{
            background: "#111",
            color: "#eee",
            padding: 16,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflow: "auto",
          }}
        >
          {log}
        </pre>
      )}
    </div>
  );
}
