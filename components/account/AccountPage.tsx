"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { plural } from "@/lib/format";
import { auth, useAccount, useStore } from "@/lib/store";
import { useNow } from "../ClientOnly";
import { Rail } from "../Rail";
import ui from "../ui.module.css";
import styles from "../pages.module.css";

type Mode = "signUp" | "signIn";

export function AccountPage() {
  const state = useStore();
  const account = useAccount();
  const now = useNow();
  const [mode, setMode] = useState<Mode>("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signIn") {
        await auth.signIn(email.trim(), password); // reloads on success
      } else {
        const { confirmEmail } = await auth.signUp(email.trim(), password);
        setMessage(
          confirmEmail
            ? { text: `Check ${email.trim()} for a confirmation link to finish creating your account.`, error: false }
            : { text: "Account created. Your cards are saved to it.", error: false },
        );
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ui.app}>
      <Rail state={state} now={now} />
      <main className={ui.main}>
        <div className={styles.scroll}>
          <div className={styles.page}>
            <div className={styles.topbar}>
              <Link href="/" className={styles.topbarBack}>
                &lsaquo; Back
              </Link>
            </div>

            {account && !account.isGuest ? (
              <section>
                <h1 className={styles.h1}>Account</h1>
                <p className={styles.lede}>
                  Signed in as {account.email}. Your {plural(state.cards.length, "card")} sync to every device you sign in on.
                </p>
                <div className={styles.actions}>
                  <button type="button" className={ui.outlineBtn} onClick={() => auth.signOut()}>
                    Sign out
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section>
                  <h1 className={styles.h1}>{mode === "signUp" ? "Create your account" : "Sign in"}</h1>
                  <p className={styles.lede}>
                    {mode === "signUp"
                      ? `You're using Stackd as a guest. Create an account to keep your ${plural(state.cards.length, "card")} and use them on other devices.`
                      : "Signing in switches to your existing account. Cards made as a guest on this device stay with the guest account."}
                  </p>
                </section>

                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.row}>
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>EMAIL</span>
                      <input className={ui.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>PASSWORD</span>
                      <input
                        className={ui.input}
                        type="password"
                        autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className={styles.formFoot}>
                    <button type="submit" className={ui.primaryBtn} disabled={busy}>
                      {mode === "signUp" ? "Create account" : "Sign in"}
                    </button>
                    <button
                      type="button"
                      className={ui.textBtn}
                      onClick={() => {
                        setMode(mode === "signUp" ? "signIn" : "signUp");
                        setMessage(null);
                      }}
                    >
                      {mode === "signUp" ? "I already have an account" : "Create an account instead"}
                    </button>
                  </div>
                  {message && (
                    <div className={`${styles.notice} ${message.error ? styles.noticeError : ""}`} role={message.error ? "alert" : "status"}>
                      {message.text}
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
