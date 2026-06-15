"use client";

import { useEffect } from "react";

export default function ReadingHistoryTracker({
  chapterId,
}: {
  chapterId: string;
}) {
  useEffect(() => {
    void fetch(`/api/history/${chapterId}`, { method: "POST" });
  }, [chapterId]);

  return null;
}
