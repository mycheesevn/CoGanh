/**
 * Harvest daily-puzzle positions from random self-play: a position
 * qualifies when the side to move has a move that wins IMMEDIATELY
 * (flips every enemy piece, or leaves the opponent with no legal move).
 * Prefers spectacular wins (most flips). Output: TS bank entries.
 * Run: npx tsx scripts/gen-puzzles.ts
 */
import {
  initialBoard, boardToString, legalMoves, applyMove, countPieces,
  opponent, moveLabel, type Board, type Color,
} from "../lib/coganh/engine";

interface Found {
  pos: string;
  turn: Color;
  winMove: string;
  flips: number;
  kind: "flipall" | "nomoves";
  pieces: number;
}

const found = new Map<string, Found>();
let seed = 1234567;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

function winningMoves(board: Board, turn: Color) {
  const out: { label: string; flips: number; kind: Found["kind"] }[] = [];
  for (const m of legalMoves(board, turn)) {
    const applied = applyMove(board, m, turn);
    const flips = applied.ganhFlips.length + applied.chetFlips.length;
    const enemy = opponent(turn);
    if (countPieces(applied.board, enemy) === 0) {
      out.push({ label: moveLabel(m, applied), flips, kind: "flipall" });
    } else if (legalMoves(applied.board, enemy).length === 0) {
      out.push({ label: moveLabel(m, applied), flips, kind: "nomoves" });
    }
  }
  return out;
}

let games = 0;
while (found.size < 40 && games < 4000) {
  games++;
  let board = initialBoard();
  let turn: Color = "blue";
  const seen = new Set<string>();
  for (let ply = 0; ply < 300; ply++) {
    const moves = legalMoves(board, turn);
    if (moves.length === 0) break;
    const key = boardToString(board) + turn;
    if (!seen.has(key) && ply >= 6) {
      const wins = winningMoves(board, turn);
      if (wins.length > 0) {
        wins.sort((a, b) => b.flips - a.flips);
        const pieces = countPieces(board, "blue") + countPieces(board, "red");
        const prev = found.get(key);
        const entry: Found = {
          pos: boardToString(board), turn,
          winMove: wins[0].label, flips: wins[0].flips, kind: wins[0].kind,
          pieces,
        };
        if (!prev || entry.flips > prev.flips) found.set(key, entry);
      }
    }
    seen.add(key);
    const m = moves[Math.floor(rnd() * moves.length)];
    board = applyMove(board, m, turn).board;
    if (countPieces(board, opponent(turn)) === 0) break;
    turn = opponent(turn);
  }
}

const list = [...found.values()]
  .sort((a, b) => b.flips - a.flips || a.pieces - b.pieces)
  .slice(0, 14);
for (const p of list) {
  console.log(
    `  { pos: "${p.pos}", turn: "${p.turn}", solution: "${p.winMove}", flips: ${p.flips}, kind: "${p.kind}" },`
  );
}
console.error(`harvested ${list.length} puzzles from ${games} games`);
