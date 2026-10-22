import type { CSSProperties } from "react";
import styles from "./Logo.module.css";

interface Props {
  /** Mark box in px. Each square is offset by at least 5px, so 24 gives 19px squares and 46 gives 38px. */
  size?: number;
  /** Wordmark font size in px; leave out for the mark alone. */
  wordmark?: number;
  className?: string;
}

/**
 * Stacked monogram (design 5d): a muted square behind, a front square with a bold "s".
 * Below 20px only the front square is drawn, as in the favicon.
 */
export function Logo({ size = 24, wordmark, className }: Props) {
  const tiny = size < 20;
  const square = tiny ? size : size - Math.max(5, Math.round(size * 0.17));
  const vars = {
    "--mark": `${size}px`,
    "--square": `${square}px`,
    "--offset": `${size - square}px`,
    "--radius": `${Math.round(square * 0.26)}px`,
    "--glyph": `${Math.round(square * 0.684)}px`,
    "--gap": `${Math.round(size * 0.22 + 4)}px`,
    "--word": wordmark ? `${wordmark}px` : undefined,
  } as CSSProperties;

  return (
    <span className={`${styles.logo} ${className ?? ""}`} style={vars} role="img" aria-label="Stackd">
      <span className={styles.mark} aria-hidden>
        {!tiny && <span className={styles.back} />}
        <span className={`${styles.front} ${tiny ? styles.solo : ""}`}>s</span>
      </span>
      {wordmark && (
        <span className={styles.word} aria-hidden>
          stackd<span className={styles.dot}>.</span>
        </span>
      )}
    </span>
  );
}
