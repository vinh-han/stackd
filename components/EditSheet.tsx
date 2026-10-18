"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { StudyCard } from "@/lib/types";
import ui from "./ui.module.css";

interface Props {
  card: StudyCard;
  onSave: (patch: { front: string; back: string; topic: string }) => void;
  onCancel: () => void;
}

/** Inline edit over the queue: AI cards will be wrong sometimes, and fixing one must not end the session. */
export function EditSheet({ card, onSave, onCancel }: Props) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [topic, setTopic] = useState(card.topic);
  const canSave = front.trim() !== "" && back.trim() !== "";

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (canSave) onSave({ front: front.trim(), back: back.trim(), topic: topic.trim() || card.topic });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <div className={ui.scrim} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className={ui.sheet} role="dialog" aria-modal="true" aria-label="Edit card" onSubmit={submit} onKeyDown={onKeyDown}>
        <div className={ui.sheetTitle}>Edit card</div>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>FRONT</span>
          <textarea className={ui.textarea} value={front} onChange={(e) => setFront(e.target.value)} rows={3} autoFocus />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>BACK</span>
          <textarea className={ui.textarea} value={back} onChange={(e) => setBack(e.target.value)} rows={4} />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>TOPIC</span>
          <input className={ui.input} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <div className={ui.sheetActions}>
          <span className={`${ui.sheetHint} ${ui.desktopOnly}`}>ctrl + enter to save</span>
          <button type="button" className={ui.outlineBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={ui.primaryBtn} disabled={!canSave}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
