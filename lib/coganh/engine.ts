/**
 * Cờ Gánh rules engine (user-confirmed rules, 2026-10-15 — docs/RULES.md).
 *
 * Board: 25 points, index = row * 5 + col. Row 0 is the TOP (Red home),
 * row 4 the BOTTOM (Blue home). Blue moves first.
 *
 * Movement graph: orthogonal lines everywhere + diagonal lines only
 * between points whose (col + row) is even (the Alquerque web, same
 * graph as Cờ Chiếu Tướng).
 *
 * Captures:
 *  - Gánh: a piece that MOVES INTO the point between two enemy pieces
 *    (3 consecutive points on any axis through the destination) flips
 *    both enemies. Every axis resolves simultaneously (multi-axis).
 *  - Chẹt: after the move, any enemy group TOUCHING the destination
 *    that has no empty adjacent point left flips in full. Groups are
 *    connected along all drawn lines (orthogonal + diagonal). A group
 *    the move did not affect (e.g. a pre-existing self-locked enemy
 *    fortress) is never flipped — chẹt completes only on the move that
 *    takes the group's last breathing point. Your OWN groups are never
 *    flipped by your own move (self-surround is a legal fortress).
 *  - Luật Mở (forced capture): if any gánh move exists for the side to
 *    move, only gánh moves are legal (free choice among them).
 *
 * Game end: a side with zero pieces loses; the side to move with no
 * legal move loses. No draw adjudication.
 */

export type Color = "blue" | "red";
export type Cell = Color | null;
export type Board = Cell[];

export const opponent = (c: Color): Color => (c === "blue" ? "red" : "blue");
export const colOf = (i: number) => i % 5;
export const rowOf = (i: number) => Math.floor(i / 5);
export const indexOf = (col: number, row: number) => row * 5 + col;

function step(i: number, dc: number, dr: number): number {
  const c = colOf(i) + dc;
  const r = rowOf(i) + dr;
  if (c < 0 || c > 4 || r < 0 || r > 4) return -1;
  if (dc !== 0 && dr !== 0 && (colOf(i) + rowOf(i)) % 2 !== 0) return -1;
  return indexOf(c, r);
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Line-neighbours of every point (movement graph). */
export const NEIGHBORS: number[][] = Array.from({ length: 25 }, (_, i) => {
  const out: number[] = [];
  for (const [dc, dr] of DIRS) {
    const n = step(i, dc, dr);
    if (n >= 0) out.push(n);
  }
  return out;
});

/** The 4 axes through a point, as [stepA, stepB] direction pairs. */
const AXES: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
  [[1, 0], [-1, 0]],
  [[0, 1], [0, -1]],
  [[1, 1], [-1, -1]],
  [[1, -1], [-1, 1]],
];

export function initialBoard(): Board {
  const s = "RRRRRR.R.R.....B.B.BBBBBB";
  return s.split("").map((ch) => (ch === "R" ? "red" : ch === "B" ? "blue" : null));
}

export function boardToString(board: Board): string {
  return board.map((c) => (c === "red" ? "R" : c === "blue" ? "B" : ".")).join("");
}

export function boardFromString(s: string): Board {
  if (s.length !== 25) throw new Error("position string must have 25 points");
  return s.split("").map((ch) => (ch === "R" ? "red" : ch === "B" ? "blue" : null));
}

export function countPieces(board: Board, color: Color): number {
  let n = 0;
  for (const c of board) if (c === color) n++;
  return n;
}

/** Enemy pieces that would flip by gánh if `color` lands on `to`. */
export function ganhFlips(board: Board, to: number, color: Color): number[] {
  const enemy = opponent(color);
  const flips: number[] = [];
  for (const [[dc1, dr1], [dc2, dr2]] of AXES) {
    const a = step(to, dc1, dr1);
    const b = step(to, dc2, dr2);
    if (a >= 0 && b >= 0 && board[a] === enemy && board[b] === enemy) {
      flips.push(a, b);
    }
  }
  return flips;
}

/** Connected group containing `start` (along all drawn lines). */
export function groupOf(board: Board, start: number): number[] {
  const color = board[start];
  if (!color) return [];
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of NEIGHBORS[cur]) {
      if (board[n] === color && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}

/** Empty points adjacent (along lines) to any member of the group. */
export function groupLiberties(board: Board, group: number[]): number[] {
  const libs = new Set<number>();
  for (const m of group) {
    for (const n of NEIGHBORS[m]) if (board[n] === null) libs.add(n);
  }
  return [...libs];
}

export interface Move {
  from: number;
  to: number;
}

/**
 * Legal moves for `color`, honouring Luật Mở: if any move makes a
 * gánh, ONLY gánh moves are returned.
 */
export function legalMoves(board: Board, color: Color): Move[] {
  const captures: Move[] = [];
  const quiet: Move[] = [];
  for (let i = 0; i < 25; i++) {
    if (board[i] !== color) continue;
    for (const j of NEIGHBORS[i]) {
      if (board[j] !== null) continue;
      if (ganhFlips(board, j, color).length > 0) captures.push({ from: i, to: j });
      else quiet.push({ from: i, to: j });
    }
  }
  return captures.length > 0 ? captures : quiet;
}

/** Is this specific move a gánh (capture) move on this board? */
export function isGanhMove(board: Board, move: Move, color: Color): boolean {
  return ganhFlips(board, move.to, color).length > 0;
}

export interface AppliedMove {
  board: Board;
  ganhFlips: number[];
  chetFlips: number[];
}

/** Apply a legal move: move → gánh (all axes) → chẹt (see header). */
export function applyMove(board: Board, move: Move, color: Color): AppliedMove {
  const b = board.slice();
  b[move.from] = null;
  b[move.to] = color;

  const gFlips = ganhFlips(b, move.to, color);
  for (const f of gFlips) b[f] = color;

  const enemy = opponent(color);
  const cFlips: number[] = [];
  const processed = new Set<number>();
  for (const n of NEIGHBORS[move.to]) {
    if (b[n] !== enemy || processed.has(n)) continue;
    const group = groupOf(b, n);
    for (const m of group) processed.add(m);
    if (groupLiberties(b, group).length === 0) {
      for (const m of group) {
        b[m] = color;
        cFlips.push(m);
      }
    }
  }
  return { board: b, ganhFlips: gFlips, chetFlips: cFlips };
}

export interface GameStatus {
  over: boolean;
  winner: Color | null;
  reason: "flipped-all" | "no-moves" | null;
}

export function gameStatus(board: Board, turn: Color): GameStatus {
  if (countPieces(board, "red") === 0) return { over: true, winner: "blue", reason: "flipped-all" };
  if (countPieces(board, "blue") === 0) return { over: true, winner: "red", reason: "flipped-all" };
  if (legalMoves(board, turn).length === 0) {
    return { over: true, winner: opponent(turn), reason: "no-moves" };
  }
  return { over: false, winner: null, reason: null };
}

/** Point name from Blue's perspective: files A–E left→right, ranks 1–5 bottom→top. */
export function pointName(i: number): string {
  return `${"ABCDE"[colOf(i)]}${5 - rowOf(i)}`;
}

export function moveLabel(
  move: Move,
  applied: AppliedMove
): string {
  let label = `${pointName(move.from)}→${pointName(move.to)}`;
  const g = applied.ganhFlips.length;
  const c = applied.chetFlips.length;
  if (g > 0) label += ` · gánh ×${g}`;
  if (c > 0) label += ` · chẹt ×${c}`;
  return label;
}

/** Repetition key for a position + side to move. */
export function positionKey(board: Board, turn: Color): string {
  return boardToString(board) + (turn === "blue" ? " b" : " r");
}
