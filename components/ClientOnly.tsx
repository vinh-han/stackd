"use client";

import { useEffect, useState } from "react";
import { loadStore, useSaveFailed, useStoreReady } from "@/lib/store";
import ui from "./ui.module.css";

/**
 * Renders children only in the browser, once saved data has loaded. Data lives in IndexedDB,
 * and due times depend on the viewer's clock and timezone, so server HTML would never match.
 */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    loadStore();
  }, []);
  const ready = useStoreReady();
  const saveFailed = useSaveFailed();
  if (!ready) return null;
  return (
    <>
      {saveFailed && (
        <div role="alert" className={ui.saveBanner}>
          Your changes are not being saved. Private browsing or blocked site data can cause this. Keep this tab open and
          check your browser settings.
        </div>
      )}
      {children}
    </>
  );
}

/** Current time, refreshed every `intervalMs` so due counts roll over without a reload. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
