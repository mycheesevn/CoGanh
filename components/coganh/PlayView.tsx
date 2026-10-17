"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import {
  applyMove, boardFromString, boardToString, gameStatus,
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

/** Quick-bar actions the shell renders in the header (play mode only). */
export interface PlayActions {
  undo: () => void;
  canUndo: boolean;
  swapSides: () => void;
  canSwap: boolean;
  hint: () => void;
  canHint: boolean;
  hintThinking: boolean;
  newGame: () => void;
}

interface Over {
  winner: Color;
  reason: "flipped-all" | "no-moves" | "resign";
}

const other = (c: Color): Color => (c === "blue" ? "red" : "blue");
const rot = (i: number) => 24 - i; // 180° rotation when the human plays Red

interface Props {
  lang: Lang;
  /** AI level, owned by the shell (drawer play-settings select). */
  level: number;
  /** Side the human plays; Blue by default. Owned by the shell. */
  humanColor: Color;
  /** Custom start handed over from the setup editor (nonce forces a reset). */
  custom?: (SetupGame & { nonce: number }) | null;
  onLogin: () => void;
  onSwapSides: () => void;
  actionsRef: React.MutableRefObject<PlayActions | null>;
  notifyActions: () => void;
}

export default function PlayView({ lang, level, humanColor, custom, onLogin, onSwapSides, actionsRef, notifyActions }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { user, refreshStats } = useAuth();
  const [boards, setBoards] = useState<BoardState[]>(() => [initialBoard()]);
  const [labels, setLabels] = useState<string[]>([]);
  const [baseTurn, setBaseTurn] = useState<Color>("blue");
  const [startPos, setStartPos] = useState<string>(() => boardToString(initialBoard()));
  const [selected, setSelected] = useState<number | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [lastFlips, setLastFlips] = useState<{ ganh: number[]; chet: number[]; move: Move } | null>(null);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [recordErr, setRecordErr] = useState<string | null>(null);
  const movesRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  const startedRef = useRef(false);
  const prevSideRef = useRef(humanColor);

  const aiColor = other(humanColor);
  const board = boards[boards.length - 1];
  const plies = labels.length;
  const turn: Color = (plies + (baseTurn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
  const humanTurn = turn === humanColor && !over;

  const legal = useMemo(
    () => (humanTurn ? legalMoves(board, humanColor) : []),
    [board, humanTurn, humanColor]
  );
  const forced = legal.length > 0 && isGanhMove(board, legal[0], humanColor);
  const targets = useMemo(
    () => (selected === null ? [] : legal.filter((m) => m.from === selected).map((m) => m.to)),
    [legal, selected]
  );
  const selectable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

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
    setHintMove(null);
    setXpToast(null);
    setRecordErr(null);
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

  /* Switching sides starts a fresh standard game (PacClone behaviour).
     Compare against the previous value instead of a mounted flag —
     StrictMode re-runs effects on mount and would wipe a custom start. */
  useEffect(() => {
    if (prevSideRef.current === humanColor) return;
    prevSideRef.current = humanColor;
    reset(boardToString(initialBoard()), "blue");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanColor]);

  /* Record the result once when the game ends (signed-in only).
     The result is stored from the HUMAN's point of view (the record RPC
     treats win/loss as the player's), whichever side the human played. */
  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const result = over.winner === humanColor ? "win" : "loss";
    recordCgGameEvent("finish", { result, level });
    if (!user) return;
    recordCgGameResult(result, over.reason, level, plies, startPos, labels)
      .then((xp) => {
        setXpToast(xp);
        refreshStats().catch(() => {});
      })
      .catch(() => {
        // A failed record must say so out loud — the game then does
        // NOT count toward stats/XP (never swallow with an empty catch).
        setRecordErr(String(s.recordFailed));
      });
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
    setHintMove(null);
    const st = gameStatus(applied.board, other(color));
    if (st.over && st.winner) {
      setOver({ winner: st.winner, reason: st.reason ?? "flipped-all" });
      if (st.winner === humanColor) { playWin(); burstConfetti(); }
      else playLose();
    }
  };

  /* Computer replies after a short, readable pause. */
  useEffect(() => {
    if (turn !== aiColor || over) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const res = findBestMove(board, aiColor, level, seenMap());
      setThinking(false);
      if (res) doMove(res.move, aiColor);
      else {
        setOver({ winner: humanColor, reason: "no-moves" });
        playWin();
        burstConfetti();
      }
    }, 550);
    return () => { clearTimeout(timer); setThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, over, board, level, aiColor]);

  const onPoint = (i: number) => {
    if (!humanTurn || thinking) return;
    setHintMove(null);
    if (selected !== null && targets.includes(i)) {
      const move = legal.find((m) => m.from === selected && m.to === i);
      if (move) doMove(move, humanColor);
      return;
    }
    if (board[i] === humanColor && selectable.has(i)) {
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
    const drop = turn === humanColor ? Math.min(2, plies) : 1;
    setBoards((prev) => prev.slice(0, prev.length - drop));
    setLabels((prev) => prev.slice(0, prev.length - drop));
    setSelected(null);
    setOver(null);
    setLastFlips(null);
    setHintMove(null);
    recordedRef.current = false;
  };

  const hint = () => {
    if (!humanTurn || thinking || hintThinking) return;
    setHintThinking(true);
    setTimeout(() => {
      const res = findBestMove(board, humanColor, Math.max(level, 8), seenMap());
      setHintThinking(false);
      if (res) {
        setHintMove(res.move);
        setSelected(res.move.from);
        playSelect();
      }
    }, 30);
  };

  /* Publish the quick-bar actions for the shell header. */
  useEffect(() => {
    actionsRef.current = {
      undo,
      canUndo: plies > 0 && !thinking,
      swapSides: onSwapSides,
      canSwap: !thinking && !over,
      hint,
      canHint: humanTurn && !thinking && !hintThinking,
      hintThinking,
      newGame,
    };
    notifyActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plies, thinking, over, humanTurn, hintThinking, humanColor, board]);

  const hintLabel = hintMove ? moveLabel(hintMove, applyMove(board, hintMove, humanColor)) : null;

  const overText = over
    ? over.winner === humanColor
      ? `${String(s.youWin)} ${over.reason === "no-moves"
          ? String(humanColor === "blue" ? s.winNoMoves : s.winNoMovesRed)
          : String(humanColor === "blue" ? s.winFlippedAll : s.winFlippedAllRed)}`
      : `${String(s.youLose)} ${over.reason === "resign" ? String(s.resigned) : over.reason === "no-moves" ? String(s.loseNoMoves) : String(humanColor === "blue" ? s.loseFlippedAll : s.loseFlippedAllRed)}`
    : null;

  /* Display transform: the human's pieces are always at the bottom. */
  const flip = humanColor === "red";
  const dispBoard = flip ? board.map((_, i) => board[rot(i)]) : board;
  const dispSelected = selected === null ? null : flip ? rot(selected) : selected;
  const dispTargets = flip ? targets.map(rot) : targets;
  const dispLastMove = lastFlips?.move
    ? flip
      ? { from: rot(lastFlips.move.from), to: rot(lastFlips.move.to) }
      : lastFlips.move
    : null;
  const dispFlipped = lastFlips
    ? [...lastFlips.ganh, ...lastFlips.chet].map((i) => (flip ? rot(i) : i))
    : [];
  const onDisplayPoint = (di: number) => onPoint(flip ? rot(di) : di);

  return (
    <div className="cg-layout">
        <div className="cg-board-area">
          <div className="cg-board-fit">
            <Board
              board={dispBoard}
              selected={dispSelected}
              targets={dispTargets}
              lastMove={dispLastMove}
              flipped={dispFlipped}
              onPoint={onDisplayPoint}
            />
          </div>
        </div>
        <aside className="cg-panel">
          <div className="cg-status" role="status">
            {over ? (
              <strong>{overText}</strong>
            ) : turn === aiColor ? (
              <span><span className={`cg-turn-dot ${aiColor}`} /> {String(aiColor === "red" ? s.computerTurn : s.computerTurnBlue)}</span>
            ) : (
              <span><span className={`cg-turn-dot ${humanColor}`} /> {String(humanColor === "blue" ? s.yourTurn : s.yourTurnAsRed)}</span>
            )}
          </div>
          {over && xpToast !== null && (
            <p className="cg-hint">⭐ +{xpToast} {String(s.xpAwarded)}</p>
          )}
          {over && recordErr && (
            <p className="cg-hint" role="status">{recordErr}</p>
          )}
          {over && !user && (
            <p className="cg-hint">
              <button className="cg-btn small" onClick={onLogin}>{String(s.login)}</button>
            </p>
          )}
          {over && (
            <div className="cg-buttons">
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
                    appUrl: "coganh.synerworlds.com",
                  });
                  await sharePng(blob, headline, headline);
                }}
              >
                {String(s.share)}
              </button>
            </div>
          )}
          {humanTurn && forced && <p className="cg-hint">⚠️ {String(s.forcedGanh)}</p>}
          {plies === 0 && !over && (
            <p className="cg-hint">{String(humanColor === "blue" ? s.startHint : s.startHintRed)}</p>
          )}
          {hintMove && hintLabel && !over && (
            <p className="cg-hint">{String(s.hint)}: <strong>{hintLabel}</strong></p>
          )}
          {lastFlips && (lastFlips.ganh.length > 0 || lastFlips.chet.length > 0) && (
            <p className="cg-hint">
              {lastFlips.ganh.length > 0 && <>⚔️ {String(s.ganh)} ×{lastFlips.ganh.length} </>}
              {lastFlips.chet.length > 0 && <>🪤 {String(s.chet)} ×{lastFlips.chet.length}</>}
            </p>
          )}
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
