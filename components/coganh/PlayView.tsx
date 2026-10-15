"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import {
  applyMove, countPieces, gameStatus, initialBoard, isGanhMove, legalMoves,
  moveLabel, positionKey,
  type Board as BoardState, type Color, type Move,
} from "@/lib/coganh/engine";
import { findBestMove } from "@/lib/coganh/ai";
import { playCapture, playLose, playMove, playSelect, playWin } from "@/lib/coganh/sound";
import { burstConfetti } from "@/lib/coganh/confetti";
import type { Strings } from "@/lib/coganh/i18n";

interface Over {
  winner: Color;
  reason: "flipped-all" | "no-moves" | "resign";
}

const LEVEL_KEY = "cg-level";

export default function PlayView({ s }: { s: Strings }) {
  const [boards, setBoards] = useState<BoardState[]>(() => [initialBoard()]);
  const [labels, setLabels] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [level, setLevel] = useState<number>(() => {
    try { return Math.min(12, Math.max(1, Number(localStorage.getItem(LEVEL_KEY)) || 5)); }
    catch { return 5; }
  });
  const [over, setOver] = useState<Over | null>(null);
  const [thinking, setThinking] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [lastFlips, setLastFlips] = useState<{ ganh: number[]; chet: number[]; move: Move } | null>(null);
  const movesRef = useRef<HTMLDivElement>(null);

  const board = boards[boards.length - 1];
  const plies = labels.length;
  const turn: Color = plies % 2 === 0 ? "blue" : "red";
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

  const seenMap = (): Map<string, number> => {
    const map = new Map<string, number>();
    boards.forEach((b, i) => {
      const t: Color = i % 2 === 0 ? "blue" : "red";
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
    setBoards([initialBoard()]);
    setLabels([]);
    setSelected(null);
    setOver(null);
    setLastFlips(null);
    setConfirmResign(false);
  };

  const undo = () => {
    if (plies === 0 || thinking) return;
    const drop = turn === "blue" ? Math.min(2, plies) : 1;
    setBoards((prev) => prev.slice(0, prev.length - drop));
    setLabels((prev) => prev.slice(0, prev.length - drop));
    setSelected(null);
    setOver(null);
    setLastFlips(null);
  };

  const overText = over
    ? over.winner === "blue"
      ? `${s.youWin} ${over.reason === "no-moves" ? s.winNoMoves : s.winFlippedAll}`
      : `${s.youLose} ${over.reason === "resign" ? s.resigned : over.reason === "no-moves" ? s.loseNoMoves : s.loseFlippedAll}`
    : null;

  return (
    <div className="cg-view">
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
              <span><span className="cg-turn-dot red" /> {s.computerTurn}</span>
            ) : (
              <span><span className="cg-turn-dot blue" /> {s.yourTurn}</span>
            )}
          </div>
          {humanTurn && forced && <p className="cg-hint">⚠️ {s.forcedGanh}</p>}
          {plies === 0 && !over && <p className="cg-hint">{s.startHint}</p>}
          {lastFlips && (lastFlips.ganh.length > 0 || lastFlips.chet.length > 0) && (
            <p className="cg-hint">
              {lastFlips.ganh.length > 0 && <>⚔️ {s.ganh} ×{lastFlips.ganh.length} </>}
              {lastFlips.chet.length > 0 && <>🪤 {s.chet} ×{lastFlips.chet.length}</>}
            </p>
          )}
          <div className="cg-stat-cards">
            <div className="cg-stat-card">🔵 {s.bluePieces}: <strong>{blueCount}</strong></div>
            <div className="cg-stat-card">🔴 {s.redPieces}: <strong>{redCount}</strong></div>
          </div>
          <label className="cg-field">
            {s.level}
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
            <button className="cg-btn cg-btn-primary" onClick={newGame}>{s.newGame}</button>
            <button className="cg-btn" onClick={undo} disabled={plies === 0 || thinking}>{s.undo}</button>
            {!over && (
              confirmResign ? (
                <>
                  <span>{s.resignConfirm}</span>
                  <button className="cg-btn cg-btn-danger" onClick={() => { setOver({ winner: "red", reason: "resign" }); playLose(); setConfirmResign(false); }}>
                    {s.yes}
                  </button>
                  <button className="cg-btn" onClick={() => setConfirmResign(false)}>{s.cancel}</button>
                </>
              ) : (
                <button className="cg-btn" onClick={() => setConfirmResign(true)}>{s.resign}</button>
              )
            )}
          </div>
          <h3>{s.moveList}</h3>
          <div className="cg-moves" ref={movesRef}>
            {labels.length === 0 && <p className="cg-muted">{s.noMovesYet}</p>}
            <ol>
              {labels.map((label, i) => (
                <li key={i}>
                  <span aria-hidden="true">{i % 2 === 0 ? "🔵" : "🔴"}</span> {label}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
