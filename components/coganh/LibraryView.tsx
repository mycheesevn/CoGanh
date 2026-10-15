"use client";

/**
 * Bí Kíp — the interactive lesson library. Chapters → lessons; each
 * lesson plays on the real board: "show" steps auto-play with an
 * explanation, "quiz" steps require the user to find the exact move.
 * Progress persists via the shared library_progress table (signed in)
 * or localStorage (guests). All lesson content is engine-verified
 * (scripts/verify-lessons.ts).
 */

import { useEffect, useMemo, useState } from "react";
import Board from "./Board";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { LESSONS, ALL_LESSONS, type Lesson } from "@/lib/coganh/lessons";
import {
  boardFromString, legalMoves, applyMove,
  type Board as BoardT, type Color,
} from "@/lib/coganh/engine";
import { parseCgLabel } from "@/lib/coganh/replay";
import {
  completeLesson, loadLocalDone, syncLibraryProgress,
} from "@/lib/supabase/libraryProgress";
import { playCapture, playMove, playSelect } from "@/lib/coganh/sound";

interface Props {
  lang: Lang;
  userId: string | null;
}

type View = { name: "home" } | { name: "lesson"; lessonId: string };

export default function LibraryView({ lang, userId }: Props) {
  const s = STR[lang];
  const [view, setView] = useState<View>({ name: "home" });
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let dead = false;
    (async () => {
      const local = loadLocalDone();
      if (!dead) setDone(new Set(local));
      const synced = await syncLibraryProgress().catch(() => null);
      if (synced && !dead) setDone(new Set(synced));
    })();
    return () => { dead = true; };
  }, [userId]);

  if (view.name === "lesson") {
    const lesson = ALL_LESSONS.find((l) => l.id === view.lessonId);
    if (lesson) {
      return (
        <LessonPlayer
          lang={lang}
          lesson={lesson}
          onBack={() => setView({ name: "home" })}
          onDone={async () => {
            await completeLesson(lesson.id).catch(() => {});
            setDone((prev) => new Set(prev).add(lesson.id));
          }}
          onNext={() => {
            const idx = ALL_LESSONS.findIndex((l) => l.id === lesson.id);
            const next = ALL_LESSONS[idx + 1];
            if (next) setView({ name: "lesson", lessonId: next.id });
            else setView({ name: "home" });
          }}
          hasNext={ALL_LESSONS.findIndex((l) => l.id === lesson.id) < ALL_LESSONS.length - 1}
        />
      );
    }
  }

  return (
    <div className="cg-scroll-area">
      <div className="cg-history-head">
        <h3>📚 {lang === "vi" ? "Bí Kíp" : "Bí Kíp — Lessons"}</h3>
        <span className="cg-history-count">{done.size}/{ALL_LESSONS.length}</span>
      </div>
      <p className="cg-hint">{String(s.bikipSubtitle)}</p>
      {LESSONS.map((ch) => (
        <div key={ch.id} className="cg-lib-chapter">
          <h4>{ch.icon} {lang === "vi" ? ch.title.vi : ch.title.en}</h4>
          <p className="cg-hint">{lang === "vi" ? ch.subtitle.vi : ch.subtitle.en}</p>
          <ul className="cg-board-list">
            {ch.lessons.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="cg-room-row-btn"
                  onClick={() => setView({ name: "lesson", lessonId: l.id })}
                >
                  <span className="cg-room-row-name">
                    {lang === "vi" ? l.title.vi : l.title.en}
                  </span>
                  <span className="cg-room-row-meta">
                    {done.has(l.id) ? String(s.bikipDone) : String(s.bikipStart)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LessonPlayer({
  lang, lesson, onBack, onDone, onNext, hasNext,
}: {
  lang: Lang;
  lesson: Lesson;
  onBack: () => void;
  onDone: () => void;
  onNext: () => void;
  hasNext: boolean;
}) {
  const s = STR[lang];
  const [stepIdx, setStepIdx] = useState(0);
  const [board, setBoard] = useState<BoardT>(() => boardFromString(lesson.startPos));
  const [sel, setSel] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [flips, setFlips] = useState<number[]>([]);
  const [wrong, setWrong] = useState(false);
  const [finished, setFinished] = useState(false);

  const step = lesson.steps[stepIdx] as (typeof lesson.steps)[number] | undefined;
  const turn: Color = useMemo(() => {
    let t: Color = lesson.startTurn;
    for (let i = 0; i < stepIdx; i++) t = t === "blue" ? "red" : "blue";
    return t;
  }, [lesson.startTurn, stepIdx]);

  const playStep = (from: number, to: number) => {
    const m = legalMoves(board, turn).find((x) => x.from === from && x.to === to);
    if (!m) return false;
    const applied = applyMove(board, m, turn);
    setBoard(applied.board);
    setLastMove({ from, to });
    setFlips([...applied.ganhFlips, ...applied.chetFlips]);
    setSel(null);
    if (applied.ganhFlips.length + applied.chetFlips.length > 0) playCapture();
    else playMove();
    return true;
  };

  /* "show" steps auto-play shortly after they become current. */
  useEffect(() => {
    if (!step || step.kind !== "show" || finished) return;
    const parsed = parseCgLabel(step.move);
    if (!parsed) return;
    const t = setTimeout(() => {
      if (playStep(parsed.from, parsed.to)) {
        setStepIdx((i) => i + 1);
      }
    }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, step, finished]);

  /* Finishing: the last step has been played (stepIdx past the end). */
  useEffect(() => {
    if (stepIdx >= lesson.steps.length && !finished) {
      setFinished(true);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const targets = useMemo(() => {
    if (sel === null || !step || step.kind !== "quiz" || finished) return [];
    return legalMoves(board, turn).filter((m) => m.from === sel).map((m) => m.to);
  }, [sel, board, turn, step, finished]);

  const onPoint = (i: number) => {
    if (!step || step.kind !== "quiz" || finished) return;
    if (sel !== null && targets.includes(i)) {
      const parsed = parseCgLabel(step.move);
      if (parsed && parsed.from === sel && parsed.to === i) {
        setWrong(false);
        playStep(sel, i);
        setStepIdx((x) => x + 1);
      } else {
        setWrong(true);
        setSel(null);
      }
      return;
    }
    if (board[i] === turn) {
      setSel(i);
      setWrong(false);
      playSelect();
    } else {
      setSel(null);
    }
  };

  return (
    <div className="cg-layout">
      <div className="cg-board-area">
        <div className="cg-board-fit">
          <Board
            board={board}
            selected={sel}
            targets={targets}
            lastMove={lastMove}
            flipped={flips}
            onPoint={onPoint}
          />
        </div>
      </div>
      <aside className="cg-panel">
        <div>
          <button type="button" className="cg-btn small" onClick={onBack}>
            ← {String(s.bikipBack)}
          </button>
        </div>
        <h3>{lang === "vi" ? lesson.title.vi : lesson.title.en}</h3>
        {stepIdx === 0 && !finished && (
          <p className="cg-lesson-text">{lang === "vi" ? lesson.intro.vi : lesson.intro.en}</p>
        )}
        {step && step.kind === "quiz" && !finished && (
          <p className="cg-lesson-text">
            ❓ {step.quizPrompt ? (lang === "vi" ? step.quizPrompt.vi : step.quizPrompt.en) : ""}
          </p>
        )}
        {stepIdx > 0 && !finished && (() => {
          const prev = lesson.steps[stepIdx - 1];
          return (
            <p className="cg-lesson-text">
              {prev.kind === "quiz" ? `${String(s.bikipQuizCorrect)} ` : ""}
              {lang === "vi" ? prev.text.vi : prev.text.en}
            </p>
          );
        })()}
        {wrong && <p className="cg-error">{String(s.bikipQuizWrong)}</p>}
        {finished && (
          <>
            <p className="cg-lesson-text">{lang === "vi" ? lesson.outro.vi : lesson.outro.en}</p>
            <p className="cg-xp-toast">{String(s.bikipComplete)}</p>
            <div className="cg-row">
              <button type="button" className="cg-btn" onClick={onBack}>
                {String(s.bikipBack)}
              </button>
              {hasNext && (
                <button type="button" className="cg-btn cg-btn-primary" onClick={onNext}>
                  {String(s.bikipNext)}
                </button>
              )}
            </div>
          </>
        )}
        <p className="cg-hint">
          {Math.min(stepIdx + (finished ? 0 : 1), lesson.steps.length)}/{lesson.steps.length}
        </p>
      </aside>
    </div>
  );
}
