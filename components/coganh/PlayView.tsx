"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import {
  applyMove, boardFromString, boardToString, countPieces, gameStatus,
  initialBoard, isGanhMove, legalMoves, moveLabel, positionKey,
  type Board as BoardState, type Color, type Move,
} from "@/lib/coganh/engine";
import { findBestMove } from "@/lib/coganh/ai";
import { playCapture, playLose, playMove, playSelect, playWin } from "@/lib/coganh/sound";
import { burstConfetti } from "@/lib/coganh/confetti";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { recordCgGameResult } from "@/lib/supabase/results";
import { recordCgGameEvent } from "@/lib/supabase/stats";
import type { SetupGame } from "./SetupView";

interface Over {
  winner: Color;
  reason: "flipped-all" | "no-moves" | "resign";
}

const LEVEL_KEY = "cg-level";

interface Props {
  lang: Lang;
  /** Custom start handed over from the setup editor (nonce forces a reset). */
  custom?: (SetupGame & { nonce: number }) | null;
  onLogin: () => void;
}

export default function PlayView({ lang, custom, onLogin }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { user, refreshStats } = useAuth();
  const [boards, setBoards] = useState<BoardState[]>(() => [initialBoard()]);
  const [labels, setLabels] = useState<string[]>([]);
  const [baseTurn, setBaseTurn] = useState<Color>("blue");
  const [startPos, setStartPos] = useState<string>(() => boardToString(initialBoard()));
  const [selected, setSelected] = useState<number | null>(null);
  const [level, setLevel] = useState<number>(() => {
    try { return Math.min(12, Math.max(1, Number(localStorage.getItem(LEVEL_KEY)) || 5)); }
    catch { return 5; }
  });
  const [over, setOver] = useState<Over | null>(null);
  const [thinking, setThinking] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [lastFlips, setLastFlips] = useState<{ ganh: number[]; chet: number[]; move: Move } | null>(null);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const movesRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  const startedRef = useRef(false);

  const board = boards[boards.length - 1];
  const plies = labels.length;
  const turn: Color = (plies + (baseTurn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
  const humanTurn = turn === "blue" && !over;

  const legal = useMemo(
    () => (humanTurn ? legalMoves(board, "blue") : []),
    [board, humanTurn]
  );
  const forced = legal.length > 0 && isGanhMove(board, legal[0], "blue");
  const targets = useMemo(
    () => (selected === null ? [] : legal.filter((m) => m.from === selected).map((m) => m.to)),
    [legal, selected]
  );
  const selectable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  const blueCount = countPieces(board, "blue");
  const redCount = countPieces(board, "red");

  useEffect(() => {
    movesRef.current?.scrollTo({ top: movesRef.current.scrollHeight });
  }, [labels.length]);

  const reset = (pos: string, first: Color) => {
    const b = boardFromString(pos);
    setBoards([b]);
    setLabels([]);
    setBaseTurn(first);
    setStartPos(pos);
    setSelected(null);
    setOver(null);
    setLastFlips(null);
    setConfirmResign(false);
    setXpToast(null);
    recordedRef.current = false;
    startedRef.current = true;
    recordCgGameEvent("start", { level });
    // A custom position may already be terminal for the side to move.
    const st = gameStatus(b, first);
    if (st.over && st.winner) {
      setOver({ winner: st.winner, reason: st.reason ?? "flipped-all" });
    }
  };

  /* First mount: count the game start. */
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      recordCgGameEvent("start", { level });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Custom start from the setup editor. */
  useEffect(() => {
    if (custom) reset(custom.position, custom.turn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom?.nonce]);

  /* Record the result once when the game ends (signed-in only). */
  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const result = over.winner === "blue" ? "win" : "loss";
    recordCgGameEvent("finish", { result, level });
    if (!user) return;
    recordCgGameResult(result, over.reason, level, plies, startPos, labels)
      .then((xp) => {
        setXpToast(xp);
        refreshStats().catch(() => {});
      })
      .catch(() => { /* stats are best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, user]);

  const seenMap = (): Map<string, number> => {
    const map = new Map<string, number>();
    boards.forEach((b, i) => {
      const t: Color = (i + (baseTurn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
      const k = positionKey(b, t);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return map;
  };

  const doMove = (move: Move, color: Color) => {
    const applied = applyMove(board, move, color);
    const label = moveLabel(move, applied);
    if (applied.ganhFlips.length + applied.chetFlips.length > 0) playCapture();
    else playMove();
    setBoards((prev) => [...prev, applied.board]);
    setLabels((prev) => [...prev, label]);
    setLastFlips({ ganh: applied.ganhFlips, chet: applied.chetFlips, move });
    setSelected(null);
    const st = gameStatus(applied.board, color === "blue" ? "red" : "blue");
    if (st.over && st.winner) {
      setOver({ winner: st.winner, reason: st.reason ?? "flipped-all" });
      if (st.winner === "blue") { playWin(); burstConfetti(); }
      else playLose();
    }
  };

  /* Computer (Red) replies after a short, readable pause. */
  useEffect(() => {
    if (turn !== "red" || over) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const res = findBestMove(board, "red", level, seenMap());
      setThinking(false);
      if (res) doMove(res.move, "red");
      else {
        setOver({ winner: "blue", reason: "no-moves" });
        playWin();
        burstConfetti();
      }
    }, 550);
    return () => { clearTimeout(timer); setThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, over, board, level]);

  const onPoint = (i: number) => {
    if (!humanTurn || thinking) return;
    if (selected !== null && targets.includes(i)) {
      const move = legal.find((m) => m.from === selected && m.to === i);
      if (move) doMove(move, "blue");
      return;
    }
    if (board[i] === "blue" && selectable.has(i)) {
      playSelect();
      setSelected(i === selected ? null : i);
    } else {
      setSelected(null);
    }
  };

  const newGame = () => {
    if (plies > 0 && !over) recordCgGameEvent("abandon", { level });
    reset(boardToString(initialBoard()), "blue");
  };

  const undo = () => {
    if (plies === 0 || thinking) return;
    const drop = turn === "blue" ? Math.min(2, plies) : 1;
    setBoards((prev) => prev.slice(0, prev.length - drop));
    setLabels((prev) => prev.slice(0, prev.length - drop));
    setSelected(null);
    setOver(null);
    setLastFlips(null);
    recordedRef.current = false;
  };

  const overText = over
    ? over.winner === "blue"
      ? `${String(s.youWin)} ${over.reason === "no-moves" ? String(s.winNoMoves) : String(s.winFlippedAll)}`
      : `${String(s.youLose)} ${over.reason === "resign" ? String(s.resigned) : over.reason === "no-moves" ? String(s.loseNoMoves) : String(s.loseFlippedAll)}`
    : null;

  return (
    <div className="cg-layout">
        <div className="cg-board-area">
          <div className="cg-board-fit">
            <Board
              board={board}
              selected={selected}
              targets={targets}
              lastMove={lastFlips?.move ?? null}
              flipped={lastFlips ? [...lastFlips.ganh, ...lastFlips.chet] : []}
              onPoint={onPoint}
            />
          </div>
        </div>
        <aside className="cg-panel">
          <div className="cg-status" role="status">
            {over ? (
              <strong>{overText}</strong>
            ) : thinking ? (
              <span><span className="cg-turn-dot red" /> {String(s.computerTurn)}</span>
            ) : (
              <span><span className="cg-turn-dot blue" /> {String(s.yourTurn)}</span>
            )}
          </div>
          {over && xpToast !== null && (
            <p className="cg-hint">⭐ +{xpToast} {String(s.xpAwarded)}</p>
          )}
          {over && !user && (
            <p className="cg-hint">
              <button className="cg-btn small" onClick={onLogin}>{String(s.login)}</button>
            </p>
          )}
          {humanTurn && forced && <p className="cg-hint">⚠️ {String(s.forcedGanh)}</p>}
          {plies === 0 && !over && <p className="cg-hint">{String(s.startHint)}</p>}
          {lastFlips && (lastFlips.ganh.length > 0 || lastFlips.chet.length > 0) && (
            <p className="cg-hint">
              {lastFlips.ganh.length > 0 && <>⚔️ {String(s.ganh)} ×{lastFlips.ganh.length} </>}
              {lastFlips.chet.length > 0 && <>🪤 {String(s.chet)} ×{lastFlips.chet.length}</>}
            </p>
          )}
          <div className="cg-stat-cards">
            <div className="cg-stat-card">🔵 {String(s.bluePieces)}: <strong>{blueCount}</strong></div>
            <div className="cg-stat-card">🔴 {String(s.redPieces)}: <strong>{redCount}</strong></div>
          </div>
          <label className="cg-field">
            {String(s.level)}
            <select
              className="cg-select"
              value={level}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLevel(v);
                try { localStorage.setItem(LEVEL_KEY, String(v)); } catch { /* noop */ }
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="cg-buttons">
            <button className="cg-btn cg-btn-primary" onClick={newGame}>{String(s.newGame)}</button>
            <button className="cg-btn" onClick={undo} disabled={plies === 0 || thinking}>{String(s.undo)}</button>
            {over && (
              <button
                className="cg-btn"
                onClick={async () => {
                  const { renderShareCard, sharePng } = await import("@/lib/coganh/shareCard");
                  const headline = over.winner === "blue"
                    ? (lang === "vi" ? "🔵 Xanh thắng!" : "🔵 Blue wins!")
                    : (lang === "vi" ? "🔴 Đỏ thắng!" : "🔴 Red wins!");
                  const blob = await renderShareCard({
                    state: board,
                    headline,
                    subline: `${labels.length} ${lang === "vi" ? "nước đi" : "moves"} · ${lang === "vi" ? "vs Máy cấp" : "vs Computer L"}${level}`,
                    appName: lang === "vi" ? "Cờ Gánh" : "Co Ganh",
                    appUrl: "coganh-my-cheese-vn.vercel.app",
                  });
                  await sharePng(blob, headline, headline);
                }}
              >
                {String(s.share)}
              </button>
            )}
            {!over && (
              confirmResign ? (
                <>
                  <span>{String(s.resignConfirm)}</span>
                  <button className="cg-btn cg-btn-danger" onClick={() => { setOver({ winner: "red", reason: "resign" }); playLose(); setConfirmResign(false); }}>
                    {String(s.yes)}
                  </button>
                  <button className="cg-btn" onClick={() => setConfirmResign(false)}>{String(s.cancel)}</button>
                </>
              ) : (
                <button className="cg-btn" onClick={() => setConfirmResign(true)}>{String(s.resign)}</button>
              )
            )}
          </div>
          <h3>{String(s.moveList)}</h3>
          <div className="cg-moves" ref={movesRef}>
            {labels.length === 0 && <p className="cg-muted">{String(s.noMovesYet)}</p>}
            <ol>
              {labels.map((label, i) => (
                <li key={i}>
                  <span aria-hidden="true">{(i + (baseTurn === "red" ? 1 : 0)) % 2 === 0 ? "🔵" : "🔴"}</span> {label}
                </li>
              ))}
            </ol>
          </div>
        </aside>
    </div>
  );
}
