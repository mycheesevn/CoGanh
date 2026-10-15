"use client";

/**
 * Thế cờ — daily puzzle + community puzzles (Phase 3C).
 * Every puzzle is a "win in 1": the side to move has a move that flips
 * all enemy pieces or leaves the opponent without a legal move. The
 * player component verifies the user's move with the live engine, so
 * ANY winning move counts. Community puzzles come from cg_puzzles
 * (migration 003); creating one requires the engine to confirm a
 * winning move exists.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Board from "./Board";
import { STR, type Lang } from "@/lib/coganh/i18n";
import {
  boardFromString, boardToString, legalMoves, applyMove, countPieces,
  opponent, moveLabel, type Board as BoardT, type Color,
} from "@/lib/coganh/engine";
import {
  dailyPuzzle, puzzleDayKey, loadSolvedDays, markSolved, puzzleStreak,
} from "@/lib/coganh/puzzles";
import { createClient } from "@/lib/supabase/client";
import { playCapture, playMove, playSelect, playWin } from "@/lib/coganh/sound";
import { burstConfetti } from "@/lib/coganh/confetti";

const PAGE_SIZE = 10;

/** Is this move an immediate win for `turn` on `board`? */
export function isWinningMove(board: BoardT, turn: Color, from: number, to: number): boolean {
  const m = legalMoves(board, turn).find((x) => x.from === from && x.to === to);
  if (!m) return false;
  const applied = applyMove(board, m, turn);
  const enemy = opponent(turn);
  return countPieces(applied.board, enemy) === 0 || legalMoves(applied.board, enemy).length === 0;
}

/** Find any immediate winning move (used to verify community posts). */
export function findWinningMove(board: BoardT, turn: Color): { from: number; to: number } | null {
  for (const m of legalMoves(board, turn)) {
    if (isWinningMove(board, turn, m.from, m.to)) return m;
  }
  return null;
}

interface PuzzlePlayerProps {
  lang: Lang;
  pos: string;
  turn: Color;
  solutionLabel?: string;
  onSolved?: () => void;
}

/** Interactive puzzle board: flipped when red is the solver. */
export function PuzzlePlayer({ lang, pos, turn, solutionLabel, onSolved }: PuzzlePlayerProps) {
  const s = STR[lang];
  const flip = turn === "red";
  const rot = (i: number) => (flip ? 24 - i : i);
  const [board, setBoard] = useState<BoardT>(() => boardFromString(pos));
  const [sel, setSel] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [flippedNow, setFlippedNow] = useState<number[]>([]);

  const targets = useMemo(() => {
    if (sel === null || solved) return [];
    return legalMoves(board, turn).filter((m) => m.from === sel).map((m) => m.to);
  }, [sel, board, turn, solved]);

  const dispBoard = useMemo(() => {
    if (!flip) return board;
    const out: BoardT = Array(25).fill(null);
    board.forEach((c, i) => { out[rot(i)] = c; });
    return out;
  }, [board, flip]);

  const onPointDisplay = (d: number) => {
    if (solved) return;
    const i = rot(d);
    if (sel !== null && targets.includes(i)) {
      const win = isWinningMove(board, turn, sel, i);
      const m = legalMoves(board, turn).find((x) => x.from === sel && x.to === i)!;
      const applied = applyMove(board, m, turn);
      setBoard(applied.board);
      setLastMove({ from: sel, to: i });
      setFlippedNow([...applied.ganhFlips, ...applied.chetFlips]);
      setSel(null);
      if (win) {
        setSolved(true);
        setWrong(false);
        playWin();
        burstConfetti();
        onSolved?.();
      } else {
        setWrong(true);
        playMove();
        // Undo the attempt so the user can retry from the start position.
        setTimeout(() => {
          setBoard(boardFromString(pos));
          setLastMove(null);
          setFlippedNow([]);
        }, 900);
      }
      return;
    }
    if (board[i] === turn) {
      setSel(i);
      setWrong(false);
      playSelect();
    } else setSel(null);
  };

  return (
    <div className="cg-layout">
      <div className="cg-board-area">
        <div className="cg-board-fit">
          <Board
            board={dispBoard}
            selected={sel !== null ? rot(sel) : null}
            targets={targets.map(rot)}
            lastMove={lastMove ? { from: rot(lastMove.from), to: rot(lastMove.to) } : null}
            flipped={flippedNow.map(rot)}
            onPoint={onPointDisplay}
          />
        </div>
      </div>
      <aside className="cg-panel">
        <p className="cg-status">
          {turn === "blue" ? `🔵 ${String(s.blueSide)}` : `🔴 ${String(s.redSide)}`} — {String(s.puzzleSolvePrompt)}
        </p>
        {wrong && <p className="cg-error">{String(s.puzzleWrong)}</p>}
        {solved && <p className="cg-xp-toast">{String(s.puzzleSolved)}</p>}
        {solved && (
          <button
            type="button"
            className="cg-btn"
            onClick={async () => {
              const { renderShareCard, sharePng } = await import("@/lib/coganh/shareCard");
              const headline = String(s.puzzleShareText);
              const blob = await renderShareCard({
                state: boardFromString(pos),
                headline: `🧩 ${headline}`,
                subline: String(s.puzzleSolvePrompt),
                appName: lang === "vi" ? "Cờ Gánh" : "Co Ganh",
                appUrl: "coganh-my-cheese-vn.vercel.app",
              });
              await sharePng(blob, headline, headline);
            }}
          >
            {String(s.puzzleShare)}
          </button>
        )}
        {!solved && !showSolution && (
          <button type="button" className="cg-btn" onClick={() => setShowSolution(true)}>
            {String(s.puzzleShowSolution)}
          </button>
        )}
        {showSolution && !solved && (
          <p className="cg-hint">{String(s.puzzleSolution)}: {solutionLabel ?? "—"}</p>
        )}
        {solved && showSolution === false && solutionLabel && (
          <p className="cg-hint">{String(s.puzzleSolution)}: {solutionLabel}</p>
        )}
      </aside>
    </div>
  );
}

interface Props {
  lang: Lang;
  userId: string | null;
  onLogin: () => void;
}

export default function PuzzleView({ lang, userId, onLogin }: Props) {
  const s = STR[lang];
  const [tab, setTab] = useState<"daily" | "community">("daily");
  const dayKey = puzzleDayKey();
  const puzzle = dailyPuzzle();
  const [solvedDays, setSolvedDays] = useState<Record<string, string>>({});
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setSolvedDays(loadSolvedDays());
    setStreak(puzzleStreak());
  }, []);

  const solvedToday = solvedDays[dayKey] === puzzle.id;

  return (
    <div className="cg-scroll-area">
      <div className="cg-tabs" role="tablist">
        <button type="button" className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>
          {String(s.puzzleDaily)}
        </button>
        <button type="button" className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}>
          {String(s.puzzleCommunity)}
        </button>
      </div>
      {tab === "daily" && (
        <>
          <div className="cg-history-head">
            <h3>🧩 {String(s.puzzleDaily)}</h3>
            <span className="cg-history-count">
              🔥 {String(s.puzzleStreak)}: {streak} {String(s.puzzleDays)}
              {solvedToday ? " · ✓" : ""}
            </span>
          </div>
          <PuzzlePlayer
            lang={lang}
            pos={puzzle.pos}
            turn={puzzle.turn}
            solutionLabel={puzzle.solution}
            onSolved={() => {
              markSolved(dayKey, puzzle.id);
              setSolvedDays(loadSolvedDays());
              setStreak(puzzleStreak());
            }}
          />
        </>
      )}
      {tab === "community" && (
        <CommunityPuzzles lang={lang} userId={userId} onLogin={onLogin} />
      )}
    </div>
  );
}

/* ---------------- community ---------------- */

interface PuzzleCard {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  pos: string;
  turn: Color;
  solution: string[];
  solves: number;
  likes: number;
  liked_by_me: boolean;
  created_at: string;
}

function CommunityPuzzles({ lang, userId, onLogin }: Props) {
  const s = STR[lang];
  const [sort, setSort] = useState<"new" | "popular">("new");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [cards, setCards] = useState<PuzzleCard[]>([]);
  const [playing, setPlaying] = useState<PuzzleCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cg_puzzle_cards", {
      p_sort: sort, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE, p_mine: mine,
    });
    if (error) { setErr(error.message); setCards([]); return; }
    setErr(null);
    setCards(((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), creator_id: String(r.creator_id),
      creator_name: String(r.creator_name), title: String(r.title),
      pos: String(r.pos), turn: r.turn as Color,
      solution: Array.isArray(r.solution) ? (r.solution as string[]) : [],
      solves: Number(r.solves), likes: Number(r.likes),
      liked_by_me: Boolean(r.liked_by_me), created_at: String(r.created_at),
    })));
  }, [sort, page, mine]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const toggleLike = async (card: PuzzleCard) => {
    if (!userId) { onLogin(); return; }
    const supabase = createClient();
    const { data } = await supabase.rpc("cg_toggle_puzzle_like", { p_puzzle_id: card.id });
    setCards((prev) => prev.map((c) => c.id === card.id
      ? { ...c, liked_by_me: Boolean(data), likes: c.likes + (Boolean(data) ? 1 : -1) }
      : c));
  };

  if (playing) {
    return (
      <div>
        <div className="cg-backbar">
          <button type="button" className="cg-btn" onClick={() => setPlaying(null)}>
            ← {String(s.puzzleCommunity)}
          </button>
          <strong>{playing.title}</strong>
          <span className="cg-hint">· {playing.creator_name}</span>
        </div>
        <PuzzlePlayer
          lang={lang}
          pos={playing.pos}
          turn={playing.turn}
          solutionLabel={playing.solution[0]}
          onSolved={async () => {
            try {
              const supabase = createClient();
              await supabase.rpc("cg_record_puzzle_solve", { p_puzzle_id: playing.id });
            } catch { /* best-effort counter */ }
            load().catch(() => {});
          }}
        />
      </div>
    );
  }

  if (creating) {
    return (
      <CreatePuzzle
        lang={lang}
        userId={userId}
        onCancel={() => setCreating(false)}
        onCreated={() => { setCreating(false); setSort("new"); setMine(true); load().catch(() => {}); }}
      />
    );
  }

  return (
    <div>
      <div className="cg-row cg-row-wrap">
        <button type="button" className={`cg-btn ${sort === "new" && !mine ? "cg-btn-primary" : ""}`}
          onClick={() => { setSort("new"); setMine(false); setPage(0); }}>
          {String(s.puzzleNewest)}
        </button>
        <button type="button" className={`cg-btn ${sort === "popular" && !mine ? "cg-btn-primary" : ""}`}
          onClick={() => { setSort("popular"); setMine(false); setPage(0); }}>
          {String(s.puzzlePopular)}
        </button>
        {userId && (
          <button type="button" className={`cg-btn ${mine ? "cg-btn-primary" : ""}`}
            onClick={() => { setMine(!mine); setPage(0); }}>
            {String(s.puzzleMine)}
          </button>
        )}
        <span className="cg-spacer" />
        {userId ? (
          <button type="button" className="cg-btn cg-btn-primary" onClick={() => setCreating(true)}>
            {String(s.puzzleNew)}
          </button>
        ) : (
          <button type="button" className="cg-btn" onClick={onLogin}>
            {String(s.puzzleLoginTeaser)}
          </button>
        )}
      </div>
      {err && <p className="cg-error">{err}</p>}
      {cards.length === 0 && !err && <p className="cg-empty-note">{String(s.puzzleNoPuzzles)}</p>}
      <ul className="cg-board-list">
        {cards.map((c) => (
          <li key={c.id} className="cg-lb-row">
            <span className="cg-lb-name">
              {c.turn === "blue" ? "🔵" : "🔴"} {c.title}
              <span className="cg-lb-sub"> · {c.creator_name} · ✓ {c.solves} {String(s.puzzleSolves)}</span>
            </span>
            <button type="button" className="cg-btn" onClick={() => toggleLike(c)}>
              {c.liked_by_me ? "❤️" : "🤍"} {c.likes}
            </button>
            <button type="button" className="cg-btn cg-btn-primary" onClick={() => setPlaying(c)}>
              {String(s.puzzlePlay)}
            </button>
          </li>
        ))}
      </ul>
      <div className="cg-row">
        <button type="button" className="cg-btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          ←
        </button>
        <span className="cg-hint">{page + 1}</span>
        <button type="button" className="cg-btn" disabled={cards.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
          →
        </button>
      </div>
    </div>
  );
}

/** Create form: tap-cycle editor (empty → blue → red); the engine must
 *  confirm a win-in-1 exists for the chosen side before posting. */
function CreatePuzzle({ lang, userId, onCancel, onCreated }: {
  lang: Lang;
  userId: string | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const s = STR[lang];
  const [cells, setCells] = useState<(Color | null)[]>(() => Array(25).fill(null));
  const [turn, setTurn] = useState<Color>("blue");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cycle = (i: number) => {
    setCells((prev) => {
      const next = prev.slice();
      next[i] = next[i] === null ? "blue" : next[i] === "blue" ? "red" : null;
      return next;
    });
  };

  const submit = async () => {
    if (!userId) return;
    const pos = boardToString(cells as BoardT);
    const board = boardFromString(pos);
    const win = findWinningMove(board, turn);
    if (!win) {
      setErr(`${String(s.puzzleInvalidPos)} — ${lang === "vi" ? "thế cờ phải có một nước thắng ngay cho bên đi" : "the position needs an immediate winning move for the side to move"}`);
      return;
    }
    setBusy(true);
    setErr(null);
    const applied = applyMove(board, win, turn);
    const label = moveLabel(win, applied);
    const supabase = createClient();
    const { error } = await supabase.from("cg_puzzles").insert({
      creator_id: userId,
      title: title.trim() || (lang === "vi" ? "Thế cờ của tôi" : "My puzzle"),
      pos,
      turn,
      solution: [label],
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onCreated();
  };

  return (
    <div className="cg-layout">
      <div className="cg-board-area">
        <div className="cg-board-fit">
          <Board board={cells as BoardT} selected={null} targets={[]} lastMove={null} flipped={[]} onPoint={cycle} />
        </div>
      </div>
      <aside className="cg-panel">
        <h3>{String(s.puzzleNew)}</h3>
        <label className="cg-field">
          <span>{String(s.puzzleTitle)}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        </label>
        <div className="cg-row">
          <span>{String(s.puzzleYourMove)}:</span>
          <button type="button" className={`cg-btn ${turn === "blue" ? "cg-btn-primary" : ""}`} onClick={() => setTurn("blue")}>
            🔵 {String(s.blueSide)}
          </button>
          <button type="button" className={`cg-btn ${turn === "red" ? "cg-btn-primary" : ""}`} onClick={() => setTurn("red")}>
            🔴 {String(s.redSide)}
          </button>
        </div>
        <p className="cg-hint">
          {lang === "vi"
            ? "Chạm ô để đổi: trống → xanh → đỏ → trống. Hệ thống chỉ đăng khi bên đi có một nước thắng ngay."
            : "Tap a point to cycle: empty → blue → red → empty. The position posts only if the side to move wins in one."}
        </p>
        {err && <p className="cg-error">{err}</p>}
        <div className="cg-row">
          <button type="button" className="cg-btn" onClick={onCancel}>{String(s.puzzleCancel)}</button>
          <button type="button" className="cg-btn cg-btn-primary" disabled={busy} onClick={submit}>
            {String(s.puzzleCreate)}
          </button>
        </div>
      </aside>
    </div>
  );
}
