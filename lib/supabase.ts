import { createClient } from "@supabase/supabase-js";

// Public by design: the publishable (anon) key only grants what row-level security allows each user.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY: in .env.local for npm run dev, and in .env for docker compose (see .env.example).",
  );
}

export const supabase = createClient(url, key);

/** Whether an OAuth provider is switched on in Supabase Auth (supabase/config.toml locally, the dashboard in production). */
export async function oauthEnabled(provider: "google"): Promise<boolean> {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
  if (!res.ok) return false;
  const settings = (await res.json()) as { external?: Record<string, boolean> };
  return !!settings.external?.[provider];
}
