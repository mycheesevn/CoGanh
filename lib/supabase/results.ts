"use client";

import { createClient } from "./client";

/**
 * Record a finished vs-computer game for the logged-in player.
 * Writes the cg_games history row and updates cg_stats (XP + counters)
 * inside the cg_record_game_result() RPC. Returns the XP awarded.
 * Mirrors chess's recordGameResult (lib/supabase/engagement.ts).
 */
export async function recordCgGameResult(
  result: "win" | "loss" | "draw",
  reason: string,
  level: number,
  plies: number,
  startPos: string,
  moves: string[]
): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("cg_record_game_result", {
    p_result: result,
    p_reason: reason,
    p_level: level,
    p_plies: plies,
    p_start_pos: startPos,
    p_moves: moves,
  });
  if (error) throw error;
  return data as number;
}

/**
 * Record a finished computer-vs-computer game in the owner's History
 * (player_color='cvc', result from BLUE's point of view). No XP/rating.
 * Signed-in only — guests watch without a record (family convention).
 */
export async function recordCgCvcGame(
  result: "win" | "loss" | "draw",
  reason: string,
  level: number,
  plies: number,
  startPos: string,
  moves: string[]
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.rpc("cg_record_cvc_game", {
    p_result: result,
    p_reason: reason,
    p_level: level,
    p_plies: plies,
    p_start_pos: startPos,
    p_moves: moves,
  });
  if (error) throw error;
}
