"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function TitleCrawlButton({
  titleId,
  titleHref,
  isDone,
  initialStatus,
  initialChapterCount,
  initialCrawledChapterCount,
  className,
}: {
  titleId: number;
  titleHref: string;
  isDone: boolean;
  initialStatus: string;
  initialChapterCount: number;
  initialCrawledChapterCount: number;
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [chapterCount, setChapterCount] = useState(initialChapterCount);
  const [crawledChapterCount, setCrawledChapterCount] = useState(
    initialCrawledChapterCount
  );
  const [message, setMessage] = useState("");

  const refreshProgress = useCallback(async () => {
    const response = await fetch(`/api/titles/${titleId}/crawl`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Could not load crawl progress");
    }

    setStatus(data.status);
    setChapterCount(data.chapterCount);
    setCrawledChapterCount(data.crawledChapterCount);

    if (data.status === "failed") {
      setMessage(data.error || "Crawl failed");
    }

    return data.status as string;
  }, [titleId]);

  useEffect(() => {
    if (status !== "crawling") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshProgress()
        .then((nextStatus) => {
          if (nextStatus === "no_changes") {
            window.alert("新しいチャプターはありません。");
          }

          if (nextStatus !== "crawling") {
            router.refresh();
          }
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Crawl failed");
        });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [refreshProgress, router, status]);

  async function crawl() {
    setStatus("crawling");
    setMessage("");

    try {
      const response = await fetch(`/api/titles/${titleId}/crawl`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Crawl failed");
      }

      setChapterCount(data.chapterCount);
      setCrawledChapterCount(data.crawledChapterCount);
      setStatus(data.status);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Crawl failed");
    }
  }

  const crawling = status === "crawling";
  const done =
    status === "completed" ||
    status === "no_changes" ||
    (status === "idle" && isDone);

  return (
    <div className={className}>
      <Link
        aria-label="View title"
        className="title-view-button"
        href={titleHref}
        title="View"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.75" />
        </svg>
      </Link>

      <button
        aria-label={done ? "Check for new chapters" : "Crawl title"}
        data-done={done}
        disabled={crawling}
        onClick={crawl}
        title={done ? "Check for new chapters" : "Crawl title"}
        type="button"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      </button>

      {crawling && (
        <span className="crawl-progress">
          {crawledChapterCount}/{chapterCount}
        </span>
      )}
      {message && <small title={message}>{message}</small>}
    </div>
  );
}
