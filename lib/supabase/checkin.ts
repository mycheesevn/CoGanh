"use client";

import { createClient } from "./client";

export interface CgCheckinResult {
  streak: number;
  xp_awarded: number;
  already_claimed: boolean;
}

/** Claim today's check-in via the cg_claim_checkin() RPC (authenticated,
 *  idempotent — returns already_claimed=true when claimed already). */
export async function claimCgCheckin(): Promise<CgCheckinResult | null> {
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("cg_claim_checkin");
    if (error || !data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      streak: Number(row.streak) || 0,
      xp_awarded: Number(row.xp_awarded) || 0,
      already_claimed: Boolean(row.already_claimed),
    };
  } catch {
    return null;
  }
}

export interface CgCheckinDay {
  checkin_date: string; // YYYY-MM-DD in the game's primary timezone
  streak: number;
}

/** Last 7 check-in rows for the calendar UI, via cg_checkin_history(). */
export async function fetchCgCheckinHistory(): Promise<CgCheckinDay[]> {
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("cg_checkin_history");
    if (error || !data || !Array.isArray(data)) return [];
    return data.map((r) => ({
      checkin_date: String(r.checkin_date).slice(0, 10),
      streak: Number(r.streak) || 0,
    }));
  } catch {
    return [];
  }
}
