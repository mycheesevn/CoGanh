"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { buildReplayStates, type ReplayGame } from "@/lib/coganh/replay";
import { burstConfetti } from "@/lib/coganh/confetti";

interface Props {
  lang: Lang;
  game: ReplayGame;
  onBack: () => void;
  onExportVideo?: (g: ReplayGame) => void;
}

/** Step through a recorded game: prev/play/next/slider/jump-to-end + move list. */
export function ReplayView({ lang, game, onBack, onExportVideo }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { states, plies } = useMemo(() => buildReplayStates(game), [game]);
  const total = plies.length;
  const [ply, setPly] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setPly(0);
    setAutoplay(false);
  }, [game]);

  useEffect(() => {
    if (!autoplay) return;
    if (ply >= total) {
      setAutoplay(false);
      return;
    }
    timer.current = window.setTimeout(() => setPly((p) => p + 1), 800);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [autoplay, ply, total]);

  /* Confetti when the replay reaches a decisive finish (re-arms on step-back). */
  const celebratedRef = useRef(false);
  useEffect(() => {
    const atDecisive = total > 0 && ply >= total && !!plies[total - 1]?.decisive;
    if (atDecisive && !celebratedRef.current) {
      celebratedRef.current = true;
      const t = window.setTimeout(() => burstConfetti(), 350);
      return () => window.clearTimeout(t);
    }
    if (!atDecisive) celebratedRef.current = false;
  }, [ply, total, plies]);

  const board = states[Math.min(ply, states.length - 1)];
  const lastPly = ply > 0 ? plies[ply - 1] : null;

  return (
    <div className="cg-layout">
      <div className="cg-board-area">
        <div className="cg-board-fit">
          <Board
            board={board}
            selected={null}
            targets={[]}
            lastMove={lastPly ? lastPly.move : null}
            flipped={lastPly ? lastPly.flips : []}
            onPoint={() => {}}
          />
        </div>
      </div>

      <aside className="cg-panel">
        <button type="button" className="cg-btn small" onClick={onBack}>
          ← {String(s.history)}
        </button>
        <h2>🎞️ {game.title}</h2>
        <p className="cg-hint">{game.subtitle}</p>

        <div className="cg-replay-controls">
          <button type="button" className="cg-btn small" disabled={ply === 0} onClick={() => setPly(0)} aria-label="Start">⏮</button>
          <button type="button" className="cg-btn small" disabled={ply === 0} onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous">◀</button>
          <span className="cg-replay-count">{ply} / {total}</span>
          <button type="button" className="cg-btn small" disabled={ply >= total} onClick={() => setPly((p) => Math.min(total, p + 1))} aria-label="Next">▶</button>
          <button type="button" className="cg-btn small" disabled={ply >= total} onClick={() => setPly(total)} aria-label="End">⏭</button>
          <button
            type="button"
            className="cg-btn small"
            disabled={ply >= total && !autoplay}
            onClick={() => setAutoplay((a) => !a)}
          >
            {autoplay ? String(s.replayPause) : String(s.replayAuto)}
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={total}
          value={ply}
          onChange={(e) => {
            setAutoplay(false);
            setPly(Number(e.target.value));
          }}
          className="cg-replay-slider"
          aria-label={String(s.replayProgress)}
        />

        {plies.length > 0 && (
          <>
            <h3>{String(s.replayMoves)}</h3>
            <ol className="cg-replay-moves">
              {plies.map((p, i) => (
                <li
                  key={i}
                  className={i === ply - 1 ? "active" : ""}
                  onClick={() => {
                    setAutoplay(false);
                    setPly(i + 1);
                  }}
                >
                  <span className="cg-replay-ply-num">{i + 1}.</span> {p.label}
                  {p.decisive ? " 🏆" : ""}
                </li>
              ))}
            </ol>
          </>
        )}

        {onExportVideo && total > 0 && (
          <button
            type="button"
            className="cg-btn"
            onClick={() => onExportVideo(game)}
            style={{ marginTop: 8 }}
          >
            🎬 {String(s.videoExport)}
          </button>
        )}
      </aside>
    </div>
  );
}
