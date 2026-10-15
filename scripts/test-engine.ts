/**
 * Cờ Gánh engine verification (run: npx tsx scripts/test-engine.ts).
 * Every expectation below is derived by hand from the confirmed rules
 * (docs/RULES.md) — not from the implementation.
 */
import {
  applyMove, boardFromString, boardToString, countPieces, gameStatus,
  ganhFlips, initialBoard, isGanhMove, legalMoves, indexOf,
  type Board, type Move,
} from "../lib/coganh/engine";

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};
const mv = (fc: number, fr: number, tc: number, tr: number): Move => ({
  from: indexOf(fc, fr),
  to: indexOf(tc, tr),
});
const empty = (): Board => Array(25).fill(null);
const put = (b: Board, c: number, r: number, v: "red" | "blue") => { b[indexOf(c, r)] = v; return b; };
const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/* ---- initial position ---- */
const init = initialBoard();
check("initial string round-trips", boardToString(init) === "RRRRRR.R.R.....B.B.BBBBBB");
check("initial counts 8v8", countPieces(init, "red") === 8 && countPieces(init, "blue") === 8);

/* perft(1): Blue (bottom) by hand = 13 quiet moves, no gánh available */
const opening = legalMoves(init, "blue");
check("opening: Blue has exactly 13 legal moves", opening.length === 13, `got ${opening.length}`);
check(
  "opening: none of the 13 is a gánh",
  opening.every((m) => !isGanhMove(init, m, "blue"))
);
/* Red also has 13 by symmetry */
check("opening: Red also has 13", legalMoves(init, "red").length === 13);

/* ---- T1: single-axis gánh ---- */
{
  const b = empty();
  put(b, 1, 2, "red"); put(b, 3, 2, "red"); put(b, 2, 3, "blue");
  const r = applyMove(b, mv(2, 3, 2, 2), "blue");
  check("T1 ganh flips both flankers", sameSet(r.ganhFlips, [indexOf(1, 2), indexOf(3, 2)]));
  check("T1 reds became blue", r.board[indexOf(1, 2)] === "blue" && r.board[indexOf(3, 2)] === "blue");
  check("T1 no chet", r.chetFlips.length === 0);
}

/* ---- T2: multi-axis gánh (2 axes, 4 flips) ---- */
{
  const b = empty();
  put(b, 1, 2, "red"); put(b, 3, 2, "red");   // horizontal pair
  put(b, 1, 1, "red"); put(b, 3, 3, "red");   // diagonal pair via (2,2)
  put(b, 2, 3, "blue");
  const r = applyMove(b, mv(2, 3, 2, 2), "blue");
  check("T2 ganh x4 across 2 axes", sameSet(r.ganhFlips,
    [indexOf(1, 2), indexOf(3, 2), indexOf(1, 1), indexOf(3, 3)]), `got ${r.ganhFlips.length}`);
}

/* ---- T3: Luật Mở — quiet moves are illegal when a gánh exists ---- */
{
  const b = empty();
  put(b, 1, 2, "red"); put(b, 3, 2, "red"); put(b, 2, 3, "blue");
  put(b, 0, 4, "blue"); // far-away blue piece with quiet moves of its own
  const legal = legalMoves(b, "blue");
  check("T3 only the ganh move is legal", legal.length === 1 && legal[0].from === indexOf(2, 3) && legal[0].to === indexOf(2, 2),
    `got ${JSON.stringify(legal)}`);
}

/* ---- T4: chẹt a single corner piece by filling its last liberty ---- */
{
  const b = empty();
  put(b, 0, 0, "red");
  put(b, 1, 0, "blue"); put(b, 0, 1, "blue");
  put(b, 2, 2, "blue");
  const r = applyMove(b, mv(2, 2, 1, 1), "blue");
  check("T4 corner piece chet-flips", sameSet(r.chetFlips, [indexOf(0, 0)]));
  check("T4 no ganh on that move", r.ganhFlips.length === 0);
  check("T4 red now blue", r.board[indexOf(0, 0)] === "blue");
}

/* ---- T5: chẹt a 2-piece group ---- */
{
  const b = empty();
  put(b, 0, 0, "red"); put(b, 1, 0, "red");
  put(b, 0, 1, "blue"); put(b, 2, 0, "blue"); put(b, 1, 2, "blue");
  const r = applyMove(b, mv(1, 2, 1, 1), "blue");
  check("T5 whole group flips", sameSet(r.chetFlips, [indexOf(0, 0), indexOf(1, 0)]), `got ${r.chetFlips}`);
}

/* ---- T6: self-locked fortress is SAFE, even after an unrelated enemy move ---- */
{
  const b = empty();
  // Blue fortress in the top-left corner: zero liberties, all exits held by red
  put(b, 0, 0, "blue"); put(b, 1, 0, "blue"); put(b, 0, 1, "blue"); put(b, 1, 1, "blue");
  put(b, 2, 0, "red"); put(b, 2, 1, "red"); put(b, 0, 2, "red"); put(b, 1, 2, "red"); put(b, 2, 2, "red");
  put(b, 4, 4, "red"); // a red piece that moves elsewhere
  // Blue "passes the lock in" by moving its corner-adjacent piece? Instead:
  // Red moves (4,4)->(4,3); the blue fortress does not touch (4,3).
  const r = applyMove(b, mv(4, 4, 4, 3), "red");
  check("T6 fortress untouched by unrelated move", r.chetFlips.length === 0 &&
    r.board[indexOf(0, 0)] === "blue" && r.board[indexOf(1, 1)] === "blue");
}

/* ---- T7: flipping the last enemy piece ends the game ---- */
{
  const b = empty();
  put(b, 1, 2, "red"); put(b, 2, 3, "blue"); put(b, 3, 2, "blue");
  // wait: ganh needs the mover BETWEEN two reds; construct properly:
  const b2 = empty();
  put(b2, 1, 2, "red"); put(b2, 3, 2, "red"); put(b2, 2, 3, "blue");
  // remove the second red by making this a 1-red board is impossible for ganh;
  // instead: red pair flips -> red count: 2 reds flip to blue, red = 0.
  const r = applyMove(b2, mv(2, 3, 2, 2), "blue");
  const st = gameStatus(r.board, "red");
  check("T7 all reds flipped -> blue wins (flipped-all)", st.over && st.winner === "blue" && st.reason === "flipped-all");
}

/* ---- T8: pieces but no legal move = loss (self-locked army) ---- */
{
  const b = empty();
  put(b, 0, 0, "blue"); put(b, 1, 0, "blue"); put(b, 0, 1, "blue"); put(b, 1, 1, "blue");
  put(b, 2, 0, "red"); put(b, 2, 1, "red"); put(b, 0, 2, "red"); put(b, 1, 2, "red"); put(b, 2, 2, "red");
  const st = gameStatus(b, "blue");
  check("T8 frozen blue army loses (no-moves)", st.over && st.winner === "red" && st.reason === "no-moves");
}

/* ---- T9: gánh flips ONLY the adjacent pair, pieces beyond are safe ---- */
{
  const b = empty();
  put(b, 0, 2, "red"); put(b, 1, 2, "red"); put(b, 3, 2, "red"); put(b, 4, 2, "red");
  put(b, 2, 3, "blue");
  const r = applyMove(b, mv(2, 3, 2, 2), "blue");
  check("T9 adjacent pair flips", sameSet(r.ganhFlips, [indexOf(1, 2), indexOf(3, 2)]));
  check("T9 outer reds stay red", r.board[indexOf(0, 2)] === "red" && r.board[indexOf(4, 2)] === "red");
}

/* ---- T10: a move that is NOT into a sandwich flips nothing ---- */
{
  const b = empty();
  put(b, 1, 2, "red"); put(b, 2, 3, "blue"); put(b, 4, 4, "red");
  const r = applyMove(b, mv(2, 3, 2, 2), "blue"); // only ONE red neighbour (1,2); (3,2) empty
  check("T10 no flips", r.ganhFlips.length === 0 && r.chetFlips.length === 0);
  check("T10 ganhFlips() agrees", ganhFlips(b, indexOf(2, 2), "blue").length === 0);
}

/* ---- T11: chẹt does NOT trigger when the group keeps one liberty ---- */
{
  const b = empty();
  put(b, 0, 0, "red");
  put(b, 1, 0, "blue"); put(b, 2, 2, "blue");
  // Blue fills (0,1)? that IS the last liberty -> would flip. Instead fill nothing:
  // move (2,2)->(2,1): destination is not a liberty of the red group {(0,0)} (libs (0,1),(1,1))
  const r = applyMove(b, mv(2, 2, 2, 1), "blue");
  check("T11 red keeps liberties, no flip", r.chetFlips.length === 0 && r.board[indexOf(0, 0)] === "red");
}

/* ---- perft determinism (2 plies) ---- */
{
  const perft = (board: Board, turn: "blue" | "red", depth: number): number => {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of legalMoves(board, turn)) {
      const next = applyMove(board, m, turn).board;
      n += perft(next, turn === "blue" ? "red" : "blue", depth - 1);
    }
    return n;
  };
  const p2a = perft(initialBoard(), "blue", 2);
  const p2b = perft(initialBoard(), "blue", 2);
  check("perft(2) deterministic and > 100", p2a === p2b && p2a > 100, `perft(2)=${p2a}`);
}

console.log(failures === 0 ? "ENGINE ALL PASS" : `ENGINE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
