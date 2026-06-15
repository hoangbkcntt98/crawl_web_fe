"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChapterCrawlButton({
  chapterId,
  isDone,
  className,
}: {
  chapterId: string;
  isDone: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function crawl() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/chapters/${chapterId}/crawl`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Crawl failed");
      }

      setMessage(`${data.imageCount} ảnh`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Crawl failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        data-done={isDone}
        disabled={loading || isDone}
        onClick={crawl}
        type="button"
      >
        {loading ? "Đang crawl..." : isDone ? "Crawl Done" : "Crawl"}
      </button>
      {message && <small title={message}>{message}</small>}
    </div>
  );
}
