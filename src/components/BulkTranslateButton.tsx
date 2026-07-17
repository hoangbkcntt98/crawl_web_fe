"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/paths";

type BulkStatus = "idle" | "running" | "completed" | "failed" | "stopped";

export default function BulkTranslateButton({
  className,
  initialTotalCount,
  initialTranslatedCount,
  titleId,
}: {
  className?: string;
  initialTotalCount: number;
  initialTranslatedCount: number;
  titleId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<BulkStatus>("idle");
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [processedCount, setProcessedCount] = useState(initialTranslatedCount);
  const [translatedCount, setTranslatedCount] = useState(
    initialTranslatedCount
  );
  const [failedCount, setFailedCount] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setStatus("idle");
      setTotalCount(initialTotalCount);
      setProcessedCount(initialTranslatedCount);
      setTranslatedCount(initialTranslatedCount);
      setFailedCount(0);
      setMessage("");

      try {
        const response = await fetch(
          apiPath(`/api/titles/${titleId}/bulk-translate`),
          { cache: "no-store" }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not load translate progress");
        }
        if (cancelled) return;

        setStatus(data.status ?? "idle");
        setTotalCount(data.totalCount ?? initialTotalCount);
        setProcessedCount(data.processedCount ?? initialTranslatedCount);
        setTranslatedCount(data.translatedCount ?? initialTranslatedCount);
        setFailedCount(data.failedCount ?? 0);
        setMessage(data.failedCount && data.error ? data.error : "");
      } catch (error) {
        if (cancelled) return;
        setStatus("failed");
        setMessage(
          error instanceof Error ? error.message : "Bulk translate failed"
        );
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [initialTotalCount, initialTranslatedCount, titleId]);

  useEffect(() => {
    if (status !== "running") return;
    let cancelled = false;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          apiPath(`/api/titles/${titleId}/bulk-translate`),
          { cache: "no-store" }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not load translate progress");
        }
        if (cancelled) return;

        setStatus(data.status);
        setTotalCount(data.totalCount ?? 0);
        setProcessedCount(data.processedCount ?? 0);
        setTranslatedCount(data.translatedCount ?? 0);
        setFailedCount(data.failedCount ?? 0);

        if (data.status === "failed" || (data.failedCount && data.error)) {
          setMessage(data.error || "Bulk translate failed");
        }

        if (data.status !== "running") {
          router.refresh();
        }
      } catch (error) {
        if (cancelled) return;
        setStatus("failed");
        setMessage(
          error instanceof Error ? error.message : "Bulk translate failed"
        );
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [router, status, titleId]);

  async function startBulkTranslate() {
    setStatus("running");
    setMessage("");
    setProcessedCount(translatedCount);
    setFailedCount(0);

    try {
      const response = await fetch(
        apiPath(`/api/titles/${titleId}/bulk-translate`),
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Bulk translate failed");
      }

      setTotalCount(data.totalCount ?? totalCount);
      setProcessedCount(data.processedCount ?? 0);
      setTranslatedCount(data.translatedCount ?? translatedCount);
      setFailedCount(data.failedCount ?? 0);
      setMessage(data.failedCount && data.error ? data.error : "");
      setStatus(data.status === "running" ? "running" : "running");
    } catch (error) {
      setStatus("failed");
      setMessage(
        error instanceof Error ? error.message : "Bulk translate failed"
      );
    }
  }

  async function stopBulkTranslate() {
    setMessage("Stopping...");

    try {
      const response = await fetch(
        apiPath(`/api/titles/${titleId}/bulk-translate`),
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Stop translate failed");
      }

      setStatus(data.status ?? "stopped");
      setTotalCount(data.totalCount ?? totalCount);
      setProcessedCount(data.processedCount ?? translatedCount);
      setTranslatedCount(data.translatedCount ?? translatedCount);
      setFailedCount(data.failedCount ?? 0);
      setMessage(data.error || "Stopped by user");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Stop translate failed"
      );
    }
  }

  const running = status === "running";
  const done = totalCount > 0 && translatedCount >= totalCount;

  return (
    <div className={className}>
      <div className="bulkTranslateButtons">
        <button
          data-done={done}
          disabled={running || totalCount === 0}
          onClick={startBulkTranslate}
          type="button"
        >
          {running
            ? `Translating ${processedCount}/${totalCount}`
            : "Bulk Translate"}
        </button>
        {running && (
          <button
            data-variant="stop"
            onClick={stopBulkTranslate}
            type="button"
          >
            Stop
          </button>
        )}
      </div>
      <small>
        {message ||
          `${translatedCount}/${totalCount} translated${
            failedCount ? `, ${failedCount} failed` : ""
          }`}
      </small>
    </div>
  );
}
