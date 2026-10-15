import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

/** Client-side only. Throws a clear error if env vars are missing. */
export function createClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  cached = createBrowserClient(url, key);
  return cached;
}

/** Nullable variant: null when env is missing (solo play unaffected). */
export function getSupabase() {
  try {
    return createClient();
  } catch {
    return null;
  }
}
