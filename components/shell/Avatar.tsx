import type { Account } from "@/lib/store";
import styles from "./shell.module.css";

/** Google name, else the part of the email before @, else "Guest". */
export function displayName(account: Account | null): string {
  if (!account || account.isGuest) return "Guest";
  return account.name || account.email?.split("@")[0] || "Account";
}

export function Avatar({ account, size }: { account: Account | null; size: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size > 30 ? 13 : 12 }} aria-hidden>
      {displayName(account).charAt(0).toUpperCase()}
    </span>
  );
}
