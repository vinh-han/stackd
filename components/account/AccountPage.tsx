"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { formatWhen, plural } from "@/lib/format";
import { previewIntervals } from "@/lib/scheduler";
import { auth, useAccount, useStore, type StoreState } from "@/lib/store";
import { useIsDesktop, useNow } from "../ClientOnly";
import { Logo } from "../Logo";
import { AppShell } from "../shell/AppShell";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import styles from "./account.module.css";

export type AccountMode = "signUp" | "signIn" | "reset";

type Message = { text: string; error: boolean };

/** Supabase's wording for a Google identity that already belongs to another user. */
const ALREADY_LINKED = /already (linked|exists|registered)|identity.*(exists|linked)/i;

function friendlyError(text: string): string {
  return ALREADY_LINKED.test(text) ? "That Google account already has a Stackd account. Sign in with it instead." : text;
}

/** "4 seconds ago", "12 minutes ago". */
function ago(date: Date, now: number): string {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 60) return `${plural(s, "second")} ago`;
  if (s < 3600) return `${plural(Math.round(s / 60), "minute")} ago`;
  if (s < 86_400) return `${plural(Math.round(s / 3600), "hour")} ago`;
  return `${plural(Math.round(s / 86_400), "day")} ago`;
}

export function AccountPage({ mode }: { mode: AccountMode }) {
  const state = useStore();
  const account = useAccount();
  const now = useNow();
  const router = useRouter();
  const desktop = useIsDesktop();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const signedIn = !!account && !account.isGuest;

  // Back from Google: errors arrive in the URL (hash or query); success means the account is no longer a guest.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const error = hash.get("error_description") ?? query.get("error_description");
    if (error) setMessage({ text: friendlyError(error), error: true });
    else if (query.get("via") === "google" && signedIn) router.replace("/");
  }, []); // once, on arrival

  const run = async (action: () => Promise<Message | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
    } catch (err) {
      setMessage({ text: friendlyError(err instanceof Error ? err.message : "Something went wrong."), error: true });
    } finally {
      setBusy(false);
    }
  };

  if (mode === "reset" && signedIn) {
    return (
      <AuthShell>
        <form
          className={styles.form}
          onSubmit={(e) =>
            submitWith(e, () =>
              run(async () => {
                await auth.setPassword(password);
                router.replace("/");
              }),
            )
          }
        >
          <div className={styles.formMain}>
            <div>
              <h1 className={styles.h1}>Choose a new password</h1>
              <p className={styles.lede}>For {account.email}.</p>
            </div>
            <div className={ui.field}>
              <label htmlFor={passwordId} className={`${ui.fieldLabel} ${styles.label}`}>
                NEW PASSWORD
              </label>
              <PasswordInput id={passwordId} value={password} onChange={setPassword} autoComplete="new-password" placeholder="8 characters minimum" />
            </div>
          </div>
          <div className={styles.formFoot}>
            <button type="submit" className={`${ui.primaryBtn} ${styles.submit}`} disabled={busy}>
              Save password
            </button>
            {message && <Notice message={message} />}
          </div>
        </form>
      </AuthShell>
    );
  }

  if (signedIn) {
    return (
      <AppShell section="account">
          <div className={pages.scroll}>
            <div className={pages.page}>
              <section>
                <h1 className={pages.h1}>Account</h1>
                <p className={pages.lede}>
                  Signed in as {account.email}. Your {plural(state.cards.length, "card")} sync to every device you sign in on.
                </p>
                <div className={pages.actions}>
                  <button type="button" className={ui.outlineBtn} onClick={() => auth.signOut()}>
                    Sign out
                  </button>
                </div>
              </section>
            </div>
          </div>
      </AppShell>
    );
  }

  const signUp = mode !== "signIn";
  const count = state.cards.length;
  const expired = mode === "reset"; // a reset link that did not sign anyone in

  const submit = (e: FormEvent) =>
    submitWith(e, () =>
      run(async () => {
        if (!signUp) {
          await auth.signIn(email.trim(), password); // reloads on success
          return;
        }
        const { confirmEmail } = await auth.signUp(email.trim(), password);
        return confirmEmail
          ? { text: `Check ${email.trim()} for a confirmation link to finish creating your account.`, error: false }
          : undefined; // the page re-renders as signed in
      }),
    );

  const forgot = () => {
    if (!email.trim()) {
      setMessage({ text: "Enter your email first, then choose Forgot password.", error: true });
      return;
    }
    run(async () => {
      await auth.sendPasswordReset(email.trim());
      return { text: `Check ${email.trim()} for a link to reset your password.`, error: false };
    });
  };

  return (
    <AuthShell
      panel={signUp && count > 0 ? <GuestCardsPanel state={state} now={now} /> : undefined}
      mobilePanel={signUp && count > 0 ? <GuestCardsPanel state={state} now={now} small /> : <ReviewDemoPanel small />}
      note={
        signUp
          ? "Free forever: 50 new cards a month, unlimited reviews."
          : "Cards made as a guest on this device stay with the guest account."
      }
    >
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formMain}>
          <div>
            <h1 className={styles.h1}>
              {expired ? "Reset link expired" : !signUp ? "Welcome back" : count > 0 ? `Keep your ${plural(count, "card")}` : "Create your account"}
            </h1>
            <p className={styles.lede}>
              {expired
                ? "Sign in, or enter your email and choose Forgot password for a new link."
                : !signUp
                  ? "Your queue is where you left it."
                  : count > 0 && desktop
                    ? "You made them as a guest. Create an account to save them and review on any device."
                    : count > 0
                      ? "Save them and review on any device."
                      : "Save your cards and review them on any device."}
            </p>
          </div>
          <button type="button" className={styles.google} disabled={busy} onClick={() => run(() => auth.google(signUp ? "signUp" : "signIn"))}>
            <span className={styles.g} aria-hidden>
              G
            </span>
            Continue with Google
          </button>
          <div className={styles.or}>or with email</div>
          <div className={styles.fields}>
            <div className={ui.field}>
              <label htmlFor={emailId} className={`${ui.fieldLabel} ${styles.label}`}>
                EMAIL
              </label>
              <input
                id={emailId}
                className={`${ui.input} ${styles.input}`}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={desktop ? "you@example.com" : "Email"}
              />
            </div>
            <div className={ui.field}>
              <span className={styles.labelRow}>
                <label htmlFor={passwordId} className={`${ui.fieldLabel} ${styles.label}`}>
                  PASSWORD
                </label>
                {!signUp && (
                  <button type="button" className={`${styles.forgot} ${ui.tap}`} onClick={forgot} disabled={busy}>
                    Forgot password?
                  </button>
                )}
              </span>
              <PasswordInput
                id={passwordId}
                value={password}
                onChange={setPassword}
                autoComplete={signUp ? "new-password" : "current-password"}
                placeholder={signUp ? (desktop ? "8 characters minimum" : "Password, 8 characters minimum") : desktop ? "" : "Password"}
              />
            </div>
          </div>
        </div>
        <div className={styles.formFoot}>
          <button type="submit" className={`${ui.primaryBtn} ${styles.submit}`} disabled={busy}>
            {signUp ? "Create account" : "Sign in"}
            {!signUp && <span className={ui.kbd}>ENTER</span>}
          </button>
          <div className={styles.switch}>
            {signUp ? (desktop ? "Already have an account? " : "Have an account? ") : "New to Stackd? "}
            <Link href={signUp ? "/account?mode=signin" : "/account"} className={`${styles.switchLink} ${ui.tap}`}>
              {signUp ? "Sign in" : "Create an account"}
            </Link>
          </div>
          {message && <Notice message={message} />}
        </div>
      </form>
    </AuthShell>
  );
}

function submitWith(e: FormEvent, action: () => void) {
  e.preventDefault();
  action();
}

function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string }) {
  return (
    <input
      id={props.id}
      className={`${ui.input} ${styles.input}`}
      type="password"
      autoComplete={props.autoComplete}
      required
      minLength={8}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
    />
  );
}

function Notice({ message }: { message: Message }) {
  return (
    <div className={`${styles.message} ${message.error ? styles.messageError : ""}`} role={message.error ? "alert" : "status"}>
      {message.text}
    </div>
  );
}

interface ShellProps {
  children: React.ReactNode;
  panel?: React.ReactNode;
  mobilePanel?: React.ReactNode;
  note?: string;
}

function AuthShell({ children, panel, mobilePanel, note }: ShellProps) {
  return (
    <div className={styles.auth}>
      <div className={styles.formCol}>
        <Link href="/" className={ui.desktopOnly} aria-label="Stackd home">
          <Logo size={24} wordmark={18} />
        </Link>
        {mobilePanel && <div className={`${styles.mPanel} ${ui.mobileOnly}`}>{mobilePanel}</div>}
        {children}
        {note && <p className={`${styles.note} ${ui.desktopOnly}`}>{note}</p>}
      </div>
      <div className={`${styles.panel} ${panel ? "" : styles.panelTight} ${ui.desktopOnly}`}>{panel ?? <ReviewDemoPanel />}</div>
    </div>
  );
}

/** Sign up: the guest's own cards, fanned, top one as it will look in review. */
function GuestCardsPanel({ state, now, small }: { state: StoreState; now: Date; small?: boolean }) {
  const { cards, decks, sources } = state;
  const top = useMemo(() => cards.reduce((a, b) => (b.createdAt < a.createdAt ? b : a)), [cards]);
  const deck = decks.find((d) => d.id === top.deckId);
  const latest = sources.reduce<(typeof sources)[number] | undefined>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), undefined);
  const topics = new Set(cards.map((c) => c.topic)).size;
  const next = cards.reduce<Date | null>((min, c) => (!c.suspended && (!min || c.srs.due < min) ? c.srs.due : min), null);
  const nextText = !next ? "" : next <= now ? "due now" : formatWhen(next, now);
  const intervals = previewIntervals(top.srs, now);
  const accent = { "--accent-h": deck?.accentHue ?? 190 } as CSSProperties;

  const fan = (
    <div className={`${styles.fan} ${small ? styles.fanSmall : ""}`} aria-hidden>
      {cards.length > 2 && <div className={`${styles.fanCard} ${styles.fan1}`} />}
      {cards.length > 1 && <div className={`${styles.fanCard} ${styles.fan2}`} />}
      <div className={`${styles.fanCard} ${styles.fanTop}`} style={accent} data-accent>
        <div className={styles.cardHead}>
          <span className={styles.cardKind}>{(small ? top.topic : `${top.type} / ${top.topic}`).toUpperCase()}</span>
          <span>1 of {cards.length}</span>
        </div>
        <p className={styles.cardFront} lang={deck?.lang}>
          {top.front}
        </p>
        {small ? (
          nextText && <div className={styles.cardFoot}>next review {nextText}</div>
        ) : (
          <div className={styles.grades}>
            {(["Again", "Hard", "Good", "Easy"] as const).map((label, i) => (
              <div key={label} className={`${styles.grade} ${label === "Good" ? styles.gradeGood : ""}`}>
                {label} <span>{intervals[(i + 1) as 1 | 2 | 3 | 4]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (small) return fan;
  return (
    <>
      {latest && latest.chunks[0] && (
        <div className={styles.paste}>
          <div className={styles.monoLabel}>
            {latest.kind === "file" ? latest.title.toUpperCase() : "YOUR PASTE"}, {ago(latest.createdAt, Date.now()).toUpperCase()}
          </div>
          <div className={styles.pasteBox}>
            <div className={styles.pasteText}>{latest.chunks[0]}</div>
          </div>
        </div>
      )}
      {fan}
      <div className={styles.caption}>
        {plural(cards.length, "card")} across {plural(topics, "topic")}.{nextText && ` Next review ${nextText}.`}
      </div>
    </>
  );
}

/** Sign in, or a guest with no cards yet: a card mid-review, to show what Stackd is. */
function ReviewDemoPanel({ small }: { small?: boolean }) {
  if (small) {
    return (
      <div className={`${styles.fan} ${styles.fanSmall}`} aria-hidden>
        <div className={`${styles.fanCard} ${styles.fan1}`} />
        <div className={`${styles.fanCard} ${styles.fan2}`} />
        <div className={`${styles.fanCard} ${styles.fanTop}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardKind}>VOCAB</span>
            <span>31 / 88 due</span>
          </div>
          <div className={styles.demoSmallWord} lang="vi">
            duy trì
          </div>
          <div className={styles.cardFoot}>to maintain, to sustain</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className={styles.demo} aria-hidden>
        <div className={styles.cardHead}>
          <span className={styles.cardKind}>VOCAB / TIENG VIET B1</span>
          <span>31 / 88 due</span>
        </div>
        <div className={styles.demoWord} lang="vi">
          duy trì
        </div>
        <div className={styles.demoRule} />
        <p className={styles.demoMeaning}>
          to maintain, to sustain. <span lang="vi">Ví dụ: duy trì thói quen học mỗi ngày.</span>
        </p>
        <div className={styles.grades}>
          {[
            ["Again", "10m"],
            ["Hard", "3d"],
            ["Good", "7d"],
            ["Easy", "16d"],
          ].map(([label, interval]) => (
            <div key={label} className={`${styles.grade} ${label === "Good" ? styles.gradeGood : ""}`}>
              {label} <span>{interval}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.stats}>
        <div>
          <div className={styles.statValue}>20-30%</div>
          <div className={styles.statLabel}>fewer reviews with FSRS</div>
        </div>
        <div>
          <div className={styles.statValue}>Any language</div>
          <div className={styles.statLabel}>cards made in your source&apos;s language</div>
        </div>
      </div>
    </>
  );
}
