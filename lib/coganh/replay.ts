// Replay helpers: decode a recorded Cờ Gánh game (start position +
// move labels) into steppable board states for the replay viewer and
// the video export. Stored labels are exactly what engine.moveLabel
// produces ("C3→C4", optionally suffixed " · gánh ×2" / " · chẹt ×3")
// — the parser reads the two point names and ignores the suffix.
import {
  applyMove, boardFromString, gameStatus, initialBoard, legalMoves, pointName,
  type Board, type Color, type Move,
} from "./engine";

export interface ReplayGame {
  labels: string[];
  /** 25-char start position (omit = standard initial). */
  startPos?: string;
  /** Side to move at start (omit = "blue" — Blue moves first). */
  startTurn?: Color;
  title: string;
  subtitle: string;
}

export interface ReplayPly {
  move: Move;
  label: string;
  /** Cells flipped by this move (gánh + chẹt). */
  flips: number[];
  /** True when this ply ends the game with a winner. */
  decisive: boolean;
}

const POINT_INDEX = new Map<string, number>();
for (let i = 0; i < 25; i++) POINT_INDEX.set(pointName(i), i);

/** Parse "C3→C4 · gánh ×2" → {from, to}; null when unparseable. */
export function parseCgLabel(label: string): Move | null {
  const m = label.match(/([A-E][1-5])\s*(?:→|->|-)\s*([A-E][1-5])/);
  if (!m) return null;
  const from = POINT_INDEX.get(m[1]);
  const to = POINT_INDEX.get(m[2]);
  if (from === undefined || to === undefined) return null;
  return { from, to };
}

/** Build the state sequence: states[0] = start, states[i] = after ply i. */
export function buildReplayStates(g: ReplayGame): {
  states: Board[];
  plies: ReplayPly[];
} {
  const startTurn: Color = g.startTurn ?? "blue";
  const start: Board =
    g.startPos && g.startPos.length === 25 ? boardFromString(g.startPos) : initialBoard();
  const states: Board[] = [start];
  const plies: ReplayPly[] = [];
  let turn = startTurn;
  for (const lab of g.labels) {
    const parsed = parseCgLabel(lab);
    if (!parsed) break;
    const cur = states[states.length - 1];
    const legal = legalMoves(cur, turn);
    const found = legal.find((mv) => mv.from === parsed.from && mv.to === parsed.to);
    if (!found) break; // corrupted record — stop rather than fabricate
    const applied = applyMove(cur, found, turn);
    const nextTurn: Color = turn === "blue" ? "red" : "blue";
    const st = gameStatus(applied.board, nextTurn);
    plies.push({
      move: found,
      label: lab,
      flips: [...applied.ganhFlips, ...applied.chetFlips],
      decisive: st.over && st.winner !== null,
    });
    states.push(applied.board);
    turn = nextTurn;
  }
  return { states, plies };
}
