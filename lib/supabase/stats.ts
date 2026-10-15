"use client";

import { createClient } from "./client";

export type CgGameEventType = "start" | "finish" | "abandon";

export interface CgGameEventMeta {
  result?: "win" | "loss" | "draw" | null;
  level?: number | null;
}

/**
 * Record a vs-computer game event (start/finish/abandon) for members and
 * guests alike, via the record_cg_game_event() RPC (SECURITY DEFINER:
 * the server stamps auth.uid() itself). Fire-and-forget: never blocks
 * the UI, failures are silent. Mirrors PacClone's recordGameEvent —
 * see the boardgame-engagement skill, references/stats.md.
 */
export function recordCgGameEvent(
  type: CgGameEventType,
  meta: CgGameEventMeta = {}
): void {
  try {
    const sb = createClient();
    sb.rpc("record_cg_game_event", {
      p_event: type,
      p_result: meta.result ?? null,
      p_level: meta.level ?? null,
    }).then(
      () => undefined,
      () => undefined
    );
  } catch {
    /* never break the game for stats */
  }
}

export interface StatBucket {
  d: string; // ISO date (day / week-start / month-start / year-start)
  c: number;
}

export interface CgGameStats {
  plays_total: number;
  plays_member: number;
  plays_guest: number;
  finished: number;
  abandoned: number;
  members_total: number;
  members_today: number;
  members_week: number;
  members_month: number;
  plays_daily: StatBucket[];
  plays_weekly: StatBucket[];
  plays_monthly: StatBucket[];
  plays_yearly: StatBucket[];
  members_daily: StatBucket[];
  members_weekly: StatBucket[];
  members_monthly: StatBucket[];
  members_yearly: StatBucket[];
}

/** Aggregated site statistics via the cg_site_stats() RPC
 *  (authenticated only — guests get null and see the fallback note). */
export async function fetchCgGameStats(): Promise<CgGameStats | null> {
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("cg_site_stats");
    if (error || !data) return null;
    return data as CgGameStats;
  } catch {
    return null;
  }
}
