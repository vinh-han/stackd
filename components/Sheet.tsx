"use client";

import { useEffect } from "react";
import ui from "./ui.module.css";

/** Bottom sheet on phones, centered dialog on desktop. Esc or a tap outside closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={ui.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={ui.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <div className={ui.sheetTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}
