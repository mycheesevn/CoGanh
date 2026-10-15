/**
 * Cờ Gánh AI — negamax + alpha-beta over the verified engine.
 *
 * 12 levels (family pattern): low levels search shallowly and pick
 * noisily; L11/L12 search deep with iterative deepening, no randomness.
 *
 * Evaluation (from the side-to-move's perspective, negamax style):
 *  material 100/piece dominates — flips swing the count by 2–7.
 *  group pressure: an enemy group on its last liberty is one move
 *    from a chẹt (big bonus); our own group on its last liberty is a
 *    warning (it can still be a safe self-locked fortress, so the
 *    penalty is smaller than the attacking bonus).
 *  mobility + point quality (degree of the point: centre web points
 *    see up to 8 lines) as tie-breakers.
 *
 * Repetition steering (family house rule — no draw adjudication):
 * the caller passes occurrence counts of positions already seen in
 * the real game; a move landing on a 3rd occurrence is excluded
 * (fallback: least-bad), a 2nd occurrence is penalised 50cp.
 */
import {
  applyMove, countPieces, gameStatus, groupLiberties, groupOf, legalMoves,
  NEIGHBORS, opponent, positionKey,
  type Board, type Color, type Move,
} from "./engine";

export interface LevelSpec {
  depth: number;
  timeMs: number;
  /** 0..1 — chance of a noisy pick among near-best moves (low levels). */
  noise: number;
  /** cp window that counts as "near-best" when noise applies. */
  noiseWindow: number;
}

export const LEVELS: Record<number, LevelSpec> = {
  1: { depth: 1, timeMs: 300, noise: 0.65, noiseWindow: 400 },
  2: { depth: 1, timeMs: 400, noise: 0.45, noiseWindow: 300 },
  3: { depth: 2, timeMs: 600, noise: 0.35, noiseWindow: 220 },
  4: { depth: 2, timeMs: 800, noise: 0.25, noiseWindow: 160 },
  5: { depth: 2, timeMs: 1000, noise: 0.15, noiseWindow: 120 },
  6: { depth: 3, timeMs: 1500, noise: 0.08, noiseWindow: 80 },
  7: { depth: 3, timeMs: 2000, noise: 0.04, noiseWindow: 50 },
  8: { depth: 4, timeMs: 3000, noise: 0, noiseWindow: 0 },
  9: { depth: 4, timeMs: 4000, noise: 0, noiseWindow: 0 },
  10: { depth: 5, timeMs: 6000, noise: 0, noiseWindow: 0 },
  11: { depth: 6, timeMs: 8000, noise: 0, noiseWindow: 0 },
  12: { depth: 7, timeMs: 12000, noise: 0, noiseWindow: 0 },
};

const WIN = 100000;
const INF = 1000000;

function evaluate(board: Board, color: Color): number {
  const enemy = opponent(color);
  const mine = countPieces(board, color);
  const theirs = countPieces(board, enemy);
  let score = (mine - theirs) * 100;

  // Group liberty pressure + point quality, one pass over both armies.
  const seenMine = new Set<number>();
  const seenTheirs = new Set<number>();
  for (let i = 0; i < 25; i++) {
    const cell = board[i];
    if (!cell) continue;
    score += NEIGHBORS[i].length * (cell === color ? 1.5 : -1.5);
    const seen = cell === color ? seenMine : seenTheirs;
    if (seen.has(i)) continue;
    const group = groupOf(board, i);
    for (const m of group) seen.add(m);
    const libs = groupLiberties(board, group).length;
    if (cell === enemy) {
      if (libs === 1) score += 45;       // one move from being chẹt
      else if (libs === 2) score += 10;
    } else {
      if (libs === 1) score -= 25;       // in danger (or a fortress — cheaper)
      else if (libs === 2) score -= 4;
    }
  }

  // Mobility: empty neighbours summed over pieces (cheap proxy that
  // already honours the movement graph).
  let myMob = 0;
  let theirMob = 0;
  for (let i = 0; i < 25; i++) {
    const cell = board[i];
    if (!cell) continue;
    let deg = 0;
    for (const n of NEIGHBORS[i]) if (board[n] === null) deg++;
    if (cell === color) myMob += deg; else theirMob += deg;
  }
  score += (myMob - theirMob) * 2;
  return score;
}

interface SearchCtx {
  deadline: number;
  nodes: number;
  tt: Map<string, { depth: number; value: number; flag: number }>;
}

function search(
  board: Board, turn: Color, depth: number, alpha: number, beta: number,
  ply: number, ctx: SearchCtx
): number {
  ctx.nodes++;
  const st = gameStatus(board, turn);
  if (st.over) return -WIN + ply; // side to move has lost (no pieces / no moves)
  if (depth === 0) return evaluate(board, turn);
  if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) return evaluate(board, turn);

  const key = positionKey(board, turn);
  const hit = ctx.tt.get(key);
  if (hit && hit.depth >= depth) {
    if (hit.flag === 0) return hit.value;
    if (hit.flag === 1) alpha = Math.max(alpha, hit.value);
    else beta = Math.min(beta, hit.value);
    if (alpha >= beta) return hit.value;
  }

  const moves = legalMoves(board, turn);
  // Order: biggest immediate flip first — improves pruning a lot.
  const scored = moves.map((m) => {
    const a = applyMove(board, m, turn);
    return { m, a, gain: a.ganhFlips.length + a.chetFlips.length };
  });
  scored.sort((x, y) => y.gain - x.gain);

  let best = -INF;
  const alpha0 = alpha;
  for (const { a } of scored) {
    const v = -search(a.board, opponent(turn), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  ctx.tt.set(key, {
    depth, value: best,
    flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0,
  });
  return best;
}

export interface AiResult {
  move: Move;
  scoreCp: number;
  depth: number;
  nodes: number;
}

/**
 * Pick the AI's move. `seen` maps positionKey → occurrence count in
 * the real game so far (repetition steering, see header).
 */
export function findBestMove(
  board: Board, turn: Color, level: number,
  seen?: Map<string, number>
): AiResult | null {
  const spec = LEVELS[Math.min(12, Math.max(1, level))] ?? LEVELS[5];
  const moves = legalMoves(board, turn);
  if (moves.length === 0) return null;
  if (moves.length === 1) {
    return { move: moves[0], scoreCp: 0, depth: 0, nodes: 1 };
  }
  const deadline = Date.now() + spec.timeMs;
  let bestMoves: { m: Move; v: number }[] = [];
  let reachedDepth = 0;
  let totalNodes = 0;

  // Iterative deepening so a time cut still yields the best-so-far move.
  for (let depth = 1; depth <= spec.depth; depth++) {
    const ctx: SearchCtx = { deadline, nodes: 0, tt: new Map() };
    const results: { m: Move; v: number }[] = [];
    for (const m of moves) {
      const applied = applyMove(board, m, turn);
      let v = -search(applied.board, opponent(turn), depth - 1, -INF, INF, 1, ctx);
      // Repetition steering at the root only.
      if (seen) {
        const occ = seen.get(positionKey(applied.board, opponent(turn))) ?? 0;
        if (occ >= 2) v -= 10000;      // would be a 3rd occurrence — avoid
        else if (occ === 1) v -= 50;   // 2nd occurrence — mild penalty
      }
      results.push({ m, v });
    }
    totalNodes += ctx.nodes;
    results.sort((a, b) => b.v - a.v);
    bestMoves = results;
    reachedDepth = depth;
    if (Date.now() > deadline) break;
  }

  let pick = bestMoves[0];
  if (spec.noise > 0 && Math.random() < spec.noise) {
    const near = bestMoves.filter((r) => pick.v - r.v <= spec.noiseWindow);
    pick = near[Math.floor(Math.random() * near.length)] ?? pick;
  }
  return { move: pick.m, scoreCp: pick.v, depth: reachedDepth, nodes: totalNodes };
}
