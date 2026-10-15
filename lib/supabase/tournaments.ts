/** Cờ Chiếu Tướng room tournaments — port of the Chess tournaments lib. */
import { createClient } from "./client";

export interface TournamentPairing {
  blue: string;
  red: string;
  result: string | null;
  match_id?: string | null;
}

export interface Tournament {
  id: string;
  room_id: string;
  name: string;
  status: string;
  pairings: TournamentPairing[];
}

export async function listTournaments(roomId: string): Promise<Tournament[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cg_tournaments")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

export async function createTournament(
  roomId: string,
  name: string
): Promise<Tournament> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cg_create_tournament", {
    p_room_id: roomId,
    p_name: name,
  });
  if (error) throw error;
  return data as Tournament;
}

export function standings(
  t: Tournament
): Array<{ player: string; score: number; wins: number }> {
  const table = new Map<string, { score: number; wins: number }>();
  const get = (id: string) => {
    let row = table.get(id);
    if (!row) {
      row = { score: 0, wins: 0 };
      table.set(id, row);
    }
    return row;
  };
  for (const p of t.pairings) {
    const r = get(p.blue);
    const g = get(p.red);
    if (p.result === "blue") {
      r.score += 1;
      r.wins += 1;
    } else if (p.result === "red") {
      g.score += 1;
      g.wins += 1;
    } else if (p.result === "draw") {
      r.score += 0.5;
      g.score += 0.5;
    }
  }
  return [...table.entries()]
    .map(([player, v]) => ({ player, score: v.score, wins: v.wins }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins);
}

/** Start the next unplayed pairing as a live match (leader, via RPC).
 *  Returns the created match id. */
export async function tournamentNextMatch(
  tournamentId: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cg_tournament_next_match", {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

/** End an open tournament early (leader, via RPC). */
export async function cancelTournament(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cg_cancel_tournament", {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
}
