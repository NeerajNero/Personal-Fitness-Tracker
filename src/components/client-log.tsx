"use client";

import { useEffect } from "react";
import { installClientLog } from "@/lib/diag/client-log";

/** Captures console.error / unhandled rejections for Settings → Diagnostics (in memory, last 20). */
export function ClientLog() {
  useEffect(() => installClientLog(), []);
  return null;
}
