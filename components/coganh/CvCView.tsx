"use client";
import React, { useEffect, useRef, useState } from "react";
import Board from "./Board";
import {
  applyMove, boardFromString, countPieces, gameStatus, moveLabel, opponent,
  positionKey, type Board as BoardState, type Color, type Move,
} from "@/lib/coganh/engine";
import { findBestMove } from "@/lib/coganh/ai";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { playCapture, playLose, playMove, playWin } from "@/lib/coganh/sound";
import { recordCgCvcGame } from "@/lib/supabase/results";
import type { SetupGame } from "./SetupView";

const MAX_PLIES = 300;

interface Props {
  lang: Lang;
  game: SetupGame;
  user: { id: string } | null;
  onBack: () => void;
}

export default function CvCView({ lang, game, user, onBack }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [boards, setBoards] = useState<BoardState[]>(() => [boardFromString(game.position)]);
  const [labels, setLabels] = useState<string[]>([]);
  const [blueLevel, setBlueLevel] = useState(5);
  const [redLevel, setRedLevel] = useState(5);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(true);
  const [over, setOver] = useState<{ winner: Color | null; reason: string } | null>(null);
  const [lastFlips, setLastFlips] = useState<{ ganh: number[]; chet: number[]; move: Move } | null>(null);
  const recordedRef = useRef(false);
  const movesRef = useRef<HTMLDivElement>(null);

  const board = boards[boards.length - 1];
  const plies = labels.length;
  const turn: Color = (plies + (game.turn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
  const startPos = game.position;

  useEffect(() => {
    movesRef.current?.scrollTo({ top: movesRef.current.scrollHeight });
  }, [labels.length]);

  useEffect(() => {
    if (!running || over) return;
    const st = gameStatus(board, turn);
    if (st.over) {
      setOver({ winner: st.winner, reason: st.reason ?? "flipped-all" });
      return;
    }
    if (plies >= MAX_PLIES) {
      setOver({ winner: null, reason: "cap" });
      return;
    }
    const level = turn === "blue" ? blueLevel : redLevel;
    const delay = 800 / speed;
    const timer = setTimeout(() => {
      const seen = new Map<string, number>();
      boards.forEach((b, i) => {
        const t: Color = (i + (game.turn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
        const k = positionKey(b, t);
        seen.set(k, (seen.get(k) ?? 0) + 1);
      });
      const res = findBestMove(board, turn, level, seen);
      if (!res) {
        setOver({ winner: opponent(turn), reason: "no-moves" });
        return;
      }
      const applied = applyMove(board, res.move, turn);
      if (applied.ganhFlips.length + applied.chetFlips.length > 0) playCapture();
      else playMove();
      setBoards((prev) => [...prev, applied.board]);
      setLabels((prev) => [...prev, moveLabel(res.move, applied)]);
      setLastFlips({ ganh: applied.ganhFlips, chet: applied.chetFlips, move: res.move });
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, over, board, turn, plies, blueLevel, redLevel, speed]);

  /* Record once, signed-in only. */
  useEffect(() => {
    if (!over || !user || recordedRef.current) return;
    recordedRef.current = true;
    const result = over.winner === null ? "draw" : over.winner === "blue" ? "win" : "loss";
    if (over.winner === "blue") playWin();
    else if (over.winner === "red") playLose();
    recordCgCvcGame(result, over.reason, Math.max(blueLevel, redLevel), plies, startPos, labels)
      .catch(() => { /* history is best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, user]);

  const overText = over
    ? over.winner === "blue"
      ? `🏆 ${String(s.blueWins)}`
      : over.winner === "red"
        ? `🏆 ${String(s.redWins)}`
        : `🤝 ${String(s.cvcDrawCap)}`
    : null;

  return (
    <div className="cg-layout">
        <div className="cg-board-area">
          <div className="cg-board-fit">
            <Board
              board={board}
              selected={null}
              targets={[]}
              lastMove={lastFlips?.move ?? null}
              flipped={lastFlips ? [...lastFlips.ganh, ...lastFlips.chet] : []}
              onPoint={() => {}}
            />
          </div>
        </div>
        <aside className="cg-panel">
          <h2>🤖 {String(s.computerVsComputer)}</h2>
          <div className="cg-status" role="status">
            {over ? <strong>{overText}</strong> : (
              <span>
                <span className={`cg-turn-dot ${turn}`} />{" "}
                {turn === "blue" ? `🔵 ${String(s.blueSide)}` : `🔴 ${String(s.redSide)}`}…
              </span>
            )}
          </div>
          <div className="cg-stat-cards">
            <div className="cg-stat-card">🔵 {countPieces(board, "blue")}</div>
            <div className="cg-stat-card">🔴 {countPieces(board, "red")}</div>
          </div>
          <label className="cg-field">
            🔵 {String(s.blueSide)} · {String(s.level)}
            <select className="cg-select" value={blueLevel} onChange={(e) => setBlueLevel(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="cg-field">
            🔴 {String(s.redSide)} · {String(s.level)}
            <select className="cg-select" value={redLevel} onChange={(e) => setRedLevel(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="cg-field">
            {String(s.speedLabel)}
            <select className="cg-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </label>
          <div className="cg-buttons">
            {!over && (
              <button className="cg-btn" onClick={() => setRunning((r) => !r)}>
                {running ? "⏸" : "▶"}
              </button>
            )}
            <button className="cg-btn" onClick={onBack}>← {String(s.setupTitleCg)}</button>
          </div>
          <h3>{String(s.moveList)}</h3>
          <div className="cg-moves" ref={movesRef}>
            {labels.length === 0 && <p className="cg-muted">{String(s.noMovesYet)}</p>}
            <ol>
              {labels.map((label, i) => (
                <li key={i}><span aria-hidden="true">{i % 2 === 0 ? (game.turn === "red" ? "🔴" : "🔵") : (game.turn === "red" ? "🔵" : "🔴")}</span> {label}</li>
              ))}
            </ol>
          </div>
        </aside>
    </div>
  );
}
