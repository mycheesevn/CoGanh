/**
 * Match decoding for rooms/correspondence: stored games are label
 * arrays; the board is derived by replaying them from the start
 * position (Blue moves first). Thin wrapper over lib/coganh/replay.
 */
import { buildReplayStates, parseCgLabel } from "@/lib/coganh/replay";
import type { Board, Color, Move } from "@/lib/coganh/engine";

export { parseCgLabel as parseMoveLabel };

export interface DecodedMatch {
  states: Board[];
  moves: Move[];
  cur: Board;
}

/** Replay stored labels into board states (stops at the first bad label). */
export function replayMatch(
  labels: string[],
  startPos?: string | null,
  startTurn: Color = "blue"
): DecodedMatch {
  const { states, plies } = buildReplayStates({
    labels,
    startPos: startPos ?? undefined,
    startTurn,
    title: "",
    subtitle: "",
  });
  return { states, moves: plies.map((p) => p.move), cur: states[states.length - 1] };
}

/** Which color the user plays in a match, or null when watching. */
export function mySideInMatch(
  userId: string | null,
  blueId: string | null,
  redId: string | null
): Color | null {
  if (!userId) return null;
  if (blueId && userId === blueId) return "blue";
  if (redId && userId === redId) return "red";
  return null;
}

/** Side to move at a given ply count (Blue moves first). */
export function turnAtPly(plies: number, startTurn: Color = "blue"): Color {
  return plies % 2 === 0 ? startTurn : startTurn === "blue" ? "red" : "blue";
}
