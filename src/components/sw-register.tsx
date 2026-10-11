"use client";

import { useEffect } from "react";

/** Registers the network-only service worker so the app is installable. */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is best-effort */
    });
  }, []);
  return null;
}
