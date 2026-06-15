"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CrawlButton({ siteKey }: { siteKey: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [log, setLog] = useState("");
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/sites/${encodeURIComponent(siteKey)}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (response.status === 404 || data.site?.crawl_status === "failed") {
          router.replace("/");
          router.refresh();
        }
      } catch {
        // A temporary polling failure should not interrupt the title list.
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [router, siteKey]);

  async function startCrawl() {
    setMessage("Starting crawler...");

    const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/crawl`, {
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

  async function clearCrawledData() {
    const confirmed = window.confirm(
      "すべてのチャプター、画像、翻訳、読書履歴を削除します。タイトル一覧は残ります。続行しますか？"
    );
    if (!confirmed) return;

    setClearing(true);
    setMessage("クロール済みデータを削除しています...");

    try {
      const res = await fetch("/api/crawl", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "CLEAR_CRAWLED_DATA" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not clear crawled data");
      }

      const deleted = data.deleted;
      setLog("");
      setMessage(
        `${data.message} Chapters: ${deleted.chapters}, Images: ${deleted.images}`
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not clear crawled data"
      );
    } finally {
      setClearing(false);
    }
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

      <button
        disabled={clearing}
        onClick={clearCrawledData}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid rgba(255, 91, 112, 0.55)",
          background: "rgba(128, 25, 42, 0.22)",
          color: "#ff9aaa",
          cursor: clearing ? "wait" : "pointer",
          marginLeft: 8,
        }}
      >
        {clearing ? "Clearing..." : "Clear crawled data"}
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
