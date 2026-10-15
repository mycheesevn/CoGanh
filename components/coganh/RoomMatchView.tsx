"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import {
  applyMove,
  countPieces,
  gameStatus,
  legalMoves,
  moveLabel,
  type Color,
  type Move,
} from "@/lib/coganh/engine";
import { buildReplayStates } from "@/lib/coganh/replay";
import { mySideInMatch, turnAtPly } from "@/lib/supabase/matchUtil";
import { fireEvent } from "@/lib/supabase/notify";
import {
  cancelMatch,
  fetchComments,
  fetchNames,
  fetchReactions,
  fetchRoom,
  finishRoomMatch,
  getMatchById,
  postComment,
  pushMove,
  react,
  REACTIONS,
  startRematch,
  subscribeMatch,
  subscribeReactions,
  type RoomComment,
  type RoomMatch,
  type XpEarned,
} from "@/lib/supabase/rooms";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth";
import { playCapture, playLose, playMove, playSelect, playWin } from "@/lib/coganh/sound";
import { burstConfetti } from "@/lib/coganh/confetti";
import { STR, type Lang } from "@/lib/coganh/i18n";

interface Props {
  match: RoomMatch;
  roomId: string;
  lang: Lang;
  userId: string | null;
  guest: boolean;
  names: { blue: string; red: string };
  onExit: () => void;
  onMatchChange: (m: RoomMatch) => void;
  onRequireLogin?: () => void;
}

interface FinalResult {
  winner: Color | null; // null = draw
  reason: string;
}

function resultFromMatch(m: RoomMatch): FinalResult | null {
  if (m.status === "cancelled") return { winner: null, reason: "cancelled" };
  if (m.status !== "finished" || !m.result) return null;
  if (m.result === "draw") return { winner: null, reason: m.reason ?? "agreement" };
  return { winner: m.result as Color, reason: m.reason ?? "flipped-all" };
}

const rot = (i: number) => 24 - i; // 180° board rotation for the Red player

export default function RoomMatchView({
  match,
  roomId,
  lang,
  userId,
  guest,
  names,
  onExit,
  onMatchChange,
  onRequireLogin,
}: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { refreshStats } = useAuth();
  const mySide = mySideInMatch(userId, match.blue_id, match.red_id);
  const isPlayer = !guest && mySide !== null;
  const flip = mySide === "red";
  const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [watchers, setWatchers] = useState(0);
  const [comments, setComments] = useState<RoomComment[]>([]);
  const [commentNames, setCommentNames] = useState<Record<string, string>>({});
  const [commentBody, setCommentBody] = useState("");
  const [shared, setShared] = useState(false);
  const [resignArmed, setResignArmed] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const finishGuard = useRef(false);
  const isLeader = !guest && userId !== null && userId === leaderId;

  const labels = pendingLabels ?? match.moves;
  useEffect(() => {
    if (pendingLabels && match.moves.length >= pendingLabels.length) {
      setPendingLabels(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.moves.length, match.id]);

  useEffect(() => {
    let dead = false;
    fetchRoom(roomId)
      .then((r) => {
        if (!dead) setLeaderId(r?.leader_id ?? null);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [roomId]);

  const { states, plies } = useMemo(
    () =>
      buildReplayStates({
        labels,
        startPos: match.start_pos || undefined,
        startTurn: "blue",
        title: "",
        subtitle: "",
      }),
    [match.start_pos, labels]
  );
  const cur = states[states.length - 1];
  const moves = plies.map((p) => p.move);
  const turn = turnAtPly(labels.length);
  const localStatus = useMemo(() => gameStatus(cur, turn), [cur, turn]);
  const serverResult = resultFromMatch(match);
  const final: FinalResult | null =
    serverResult ??
    (localStatus.over
      ? { winner: localStatus.winner, reason: localStatus.reason ?? "flipped-all" }
      : null);
  const playing = match.status === "active" && !localStatus.over;
  const legal = useMemo(
    () => (playing ? legalMoves(cur, turn) : []),
    [playing, cur, turn]
  );
  const targets = useMemo(
    () => (sel === null ? [] : legal.filter((m) => m.from === sel)),
    [legal, sel]
  );
  const lastMove: Move | null = moves.length > 0 ? moves[moves.length - 1] : null;
  const lastFlips = plies.length > 0 ? plies[plies.length - 1].flips : [];
  const counts = { blue: countPieces(cur, "blue"), red: countPieces(cur, "red") };

  /* ---------------- realtime + polling ---------------- */
  useEffect(() => {
    finishGuard.current = false;
    seenReactionIds.current = new Set();
    reactionsPrimed.current = false;
    let dead = false;
    const ch = subscribeMatch(
      match.id,
      (m) => {
        if (!dead) onMatchChange(m);
      },
      {
        userId,
        onPresence: (n) => {
          if (!dead) setWatchers(n);
        },
      }
    );
    const refresh = async () => {
      try {
        const m = await getMatchById(match.id);
        if (!dead && m) onMatchChange(m);
        if (!guest) {
          const cmts = await fetchComments(roomId).catch(() => [] as RoomComment[]);
          if (dead) return;
          setComments(cmts.filter((c) => c.match_id === match.id));
          const nm = await fetchNames(cmts.map((c) => c.user_id)).catch(() => ({}));
          if (!dead) setCommentNames(nm);
        }
        const reacts = await fetchReactions(match.id).catch(() => []);
        if (dead) return;
        for (const r of reacts) {
          if (seenReactionIds.current.has(r.id)) continue;
          seenReactionIds.current.add(r.id);
          if (reactionsPrimed.current) spawnFloater(r.emoji);
        }
        reactionsPrimed.current = true;
      } catch {
        /* polling is best-effort */
      }
    };
    const t = setInterval(refresh, 4000);
    void refresh();
    return () => {
      dead = true;
      clearInterval(t);
      try {
        createClient().removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  /* ---------------- reaction floaters ---------------- */
  const [floaters, setFloaters] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const floaterId = useRef(0);
  const lastReactRef = useRef(0);
  const seenReactionIds = useRef<Set<string>>(new Set());
  const reactionsPrimed = useRef(false);
  const spawnFloater = (emoji: string) => {
    const id = ++floaterId.current;
    const x = 8 + Math.random() * 76;
    setFloaters((f) => [...f.slice(-11), { id, emoji, x }]);
    window.setTimeout(() => setFloaters((f) => f.filter((fl) => fl.id !== id)), 2200);
  };
  useEffect(() => {
    const ch = subscribeReactions(match.id, (emoji, rowId) => {
      if (rowId) {
        if (seenReactionIds.current.has(rowId)) return;
        seenReactionIds.current.add(rowId);
      }
      spawnFloater(emoji);
    });
    return () => {
      try {
        createClient().removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  const doReact = (emoji: string) => {
    if (!userId || guest) return;
    const now = Date.now();
    if (now - lastReactRef.current < 1500) return;
    lastReactRef.current = now;
    react(match.id, emoji).catch(() => {});
  };

  useEffect(() => {
    if (!resignArmed && !cancelArmed) return;
    const t = setTimeout(() => {
      setResignArmed(false);
      setCancelArmed(false);
    }, 3500);
    return () => clearTimeout(t);
  }, [resignArmed, cancelArmed]);

  /* ---------------- finishing ---------------- */
  const doFinish = async (result: "blue" | "red" | "draw", reason: string) => {
    if (finishGuard.current) return;
    finishGuard.current = true;
    try {
      const xp: XpEarned | null = await finishRoomMatch(match.id, result, reason);
      if (xp) {
        const total = xp.play_xp + xp.host_xp + xp.daily_xp;
        if (total > 0) setXpToast(total);
        await refreshStats().catch(() => {});
      }
      const m = await getMatchById(match.id).catch(() => null);
      if (m) onMatchChange(m);
    } catch {
      finishGuard.current = false;
    }
  };

  // Mover-side game-over detection (idempotent on the server).
  useEffect(() => {
    if (
      match.status === "active" &&
      localStatus.over &&
      localStatus.winner !== null &&
      isPlayer &&
      !finishGuard.current
    ) {
      void doFinish(localStatus.winner, localStatus.reason ?? "flipped-all");
      if (localStatus.winner === mySide) playWin();
      else playLose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStatus, match.status, match.id]);

  // Decisive-finish celebration for the winner, once per match.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (match.status !== "finished" || !final || final.winner === null) return;
    if (final.reason !== "flipped-all" && final.reason !== "no-moves") return;
    if (final.winner !== mySide) return;
    if (celebratedRef.current === match.id) return;
    celebratedRef.current = match.id;
    const t = window.setTimeout(() => burstConfetti(), 450);
    return () => window.clearTimeout(t);
  }, [match.status, match.id, final, mySide]);

  /* ---------------- moves ---------------- */
  const doMove = (move: Move) => {
    if (!isPlayer || mySide !== turn) return;
    const applied = applyMove(cur, move, turn);
    const label = moveLabel(move, applied);
    const newLabels = [...labels, label];
    setPendingLabels(newLabels);
    setSel(null);
    if (applied.ganhFlips.length + applied.chetFlips.length > 0) playCapture();
    else playMove();
    pushMove(match.id, newLabels).catch(() => {
      setPendingLabels(null);
    });
    // Push-notify the opponent it's their turn (best-effort).
    const oppId = mySide === "blue" ? match.red_id : match.blue_id;
    if (oppId) void fireEvent("turn", { to: oppId, match: match.id });
  };

  const onPointDisplay = (di: number) => {
    if (!playing || !isPlayer || mySide !== turn) return;
    const i = flip ? rot(di) : di;
    if (sel !== null) {
      const m = legal.find((x) => x.from === sel && x.to === i);
      if (m) {
        doMove(m);
        return;
      }
    }
    if (cur[i] === mySide) {
      if (sel === i) setSel(null);
      else {
        setSel(i);
        playSelect();
      }
    } else {
      setSel(null);
    }
  };

  const onResign = () => {
    if (!resignArmed) {
      setResignArmed(true);
      return;
    }
    setResignArmed(false);
    if (!mySide) return;
    void doFinish(mySide === "blue" ? "red" : "blue", "resign");
  };

  const onCancel = () => {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setCancelArmed(false);
    cancelMatch(match.id)
      .then(() => getMatchById(match.id))
      .then((m) => {
        if (m) onMatchChange(m);
      })
      .catch(() => {});
  };

  const onRematch = async () => {
    try {
      const m = await startRematch(roomId);
      onMatchChange(m);
    } catch {
      /* stay on the finished match */
    }
  };

  const reasonText = (r: FinalResult): string =>
    r.reason === "flipped-all"
      ? String(s.reasonFlippedAll)
      : r.reason === "no-moves"
        ? String(s.reasonNoMoves)
        : r.reason === "resign"
          ? String(s.reasonResign)
          : r.reason === "cancelled"
            ? String(s.roomReasonCancelled)
            : "";

  const shareResult = () => {
    if (!final) return;
    const outcome =
      final.winner === null
        ? String(s.roomDraw)
        : final.winner === "blue"
          ? String(s.roomBlueWins)
          : String(s.roomRedWins);
    const text =
      `${String(s.appName)} — ${names.blue} vs ${names.red}: ${outcome} ` +
      `(${reasonText(final)}, ${labels.length} ${lang === "vi" ? "nước" : "plies"})`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      })
      .catch(() => {});
  };

  const sendComment = () => {
    const body = commentBody.trim();
    if (!body) return;
    setCommentBody("");
    postComment(roomId, match.id, body, labels.length)
      .then(() => fetchComments(roomId))
      .then((cmts) => {
        setComments(cmts.filter((c) => c.match_id === match.id));
        return fetchNames(cmts.map((c) => c.user_id)).catch(() => ({}));
      })
      .then(setCommentNames)
      .catch(() => {});
  };

  // Display-side (possibly rotated) board + interaction props.
  const dispBoard = flip ? cur.map((_, i) => cur[rot(i)]) : cur;
  const dispSel = sel === null ? null : flip ? rot(sel) : sel;
  const dispTargets = targets.map((m) => (flip ? rot(m.to) : m.to));
  const dispLast = lastMove
    ? flip
      ? { from: rot(lastMove.from), to: rot(lastMove.to) }
      : lastMove
    : null;
  const dispFlips = flip ? lastFlips.map(rot) : lastFlips;

  const turnName = turn === "blue" ? names.blue : names.red;
  const watcherCount = isPlayer && mySide ? Math.max(0, watchers - 2) : watchers;

  return (
    <div className="cg-layout">
      <div className="cg-board-col">
        <div className="cg-board-area">
          <div className="cg-board-fit">
            <Board
              board={dispBoard}
              selected={dispSel}
              targets={dispTargets}
              lastMove={dispLast}
              flipped={dispFlips}
              onPoint={onPointDisplay}
            />
            {floaters.map((f) => (
              <span
                key={f.id}
                className="cg-reaction-float"
                style={{ left: `${f.x}%` }}
                aria-hidden="true"
              >
                {f.emoji}
              </span>
            ))}
          </div>
        </div>
        {match.status === "active" && !final && (
          <div className="cg-room-match-actions">
            {!guest && userId ? (
              <div
                className="cg-reaction-bar"
                role="group"
                aria-label={lang === "vi" ? "Thả biểu tượng" : "React"}
              >
                {REACTIONS.map((e) => (
                  <button key={e} type="button" className="cg-reaction-btn" onClick={() => doReact(e)}>
                    {e}
                  </button>
                ))}
              </div>
            ) : guest && onRequireLogin ? (
              <button type="button" className="cg-btn small" onClick={onRequireLogin}>
                👏🔥 {String(s.guestReactTeaser)}
              </button>
            ) : null}
            {playing && isPlayer && (
              <button
                className={`cg-btn small${resignArmed ? " cg-btn-danger" : ""}`}
                onClick={onResign}
              >
                {resignArmed ? String(s.roomResignConfirm) : String(s.roomResign)}
              </button>
            )}
            {isLeader && (
              <button
                className={`cg-btn small${cancelArmed ? " cg-btn-danger" : ""}`}
                onClick={onCancel}
              >
                {cancelArmed ? String(s.roomCancelConfirm) : String(s.roomCancelMatch)}
              </button>
            )}
            <button className="cg-btn small" onClick={onExit}>
              {String(s.roomBackToRoom)}
            </button>
          </div>
        )}
      </div>
      <div className="cg-panel">
        <div className="cg-vs-header">
          <span className="cg-vs-side blue">
            🔵 {names.blue}
            {mySide === "blue" && !guest && ` (${String(s.you)})`}
          </span>
          <span className="cg-vs-mid">⚔️</span>
          <span className="cg-vs-side red">
            🔴 {names.red}
            {mySide === "red" && !guest && ` (${String(s.you)})`}
          </span>
        </div>

        {final ? (
          <div className="cg-gameover">
            <div className="cg-result">
              {match.status === "cancelled"
                ? String(s.roomReasonCancelled)
                : final.winner === null
                  ? String(s.roomDraw)
                  : final.winner === "blue"
                    ? String(s.roomBlueWins)
                    : String(s.roomRedWins)}
            </div>
            <div className="cg-reason">{match.status === "cancelled" ? "" : reasonText(final)}</div>
            {final.winner !== null && match.status !== "cancelled" && (
              <div className="cg-hint">{final.winner === "blue" ? names.blue : names.red}</div>
            )}
            {xpToast !== null && xpToast > 0 && (
              <div className="cg-xp-toast">
                {String(s.roomXpEarned).replace("{n}", String(xpToast))}
              </div>
            )}
            <div className="cg-actions">
              <button className="cg-btn" onClick={shareResult}>
                {shared ? String(s.roomShared) : String(s.roomShare)}
              </button>
              {isPlayer && match.status !== "active" && (
                <button className="cg-btn cg-btn-primary" onClick={onRematch}>
                  {String(s.roomRematch)}
                </button>
              )}
              <button className="cg-btn" onClick={onExit}>
                {String(s.roomBackToRoom)}
              </button>
            </div>
          </div>
        ) : (
          <div className="cg-status">
            <span
              className="cg-turn-dot"
              style={{ background: turn === "blue" ? "#2569b8" : "#cf3a30" }}
            />
            <span>
              {guest
                ? String(s.roomSpectating)
                : isPlayer && mySide === turn
                  ? String(s.roomYourTurn)
                  : String(s.roomTurnOf).replace("{name}", turnName)}
            </span>
            <span className="cg-hint">
              {String(s.roomWatchers).replace("{n}", String(watcherCount))}
            </span>
          </div>
        )}
        {guest && !final && <div className="cg-guest-banner">{String(s.guestSpectateBanner)}</div>}

        <div className="cg-counts">
          <span>🔵 {counts.blue}</span>
          <span>🔴 {counts.red}</span>
        </div>

        {labels.length > 0 && (
          <div className="cg-moves">
            {labels.map((lab, i) => (
              <div key={i} className="cg-move-row">
                <span className="cg-move-num">{i + 1}.</span>
                <span>{i % 2 === 0 ? "🔵" : "🔴"} {lab}</span>
              </div>
            ))}
          </div>
        )}

        <div className="cg-panel">
          <h3>{String(s.roomComments)}</h3>
          {guest ? (
            <p className="cg-hint">{String(s.guestCommentTeaser)}</p>
          ) : (
            <div className="cg-comment-form">
              <input
                className="cg-input"
                value={commentBody}
                maxLength={500}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={String(s.roomWriteComment)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendComment();
                }}
              />
              <button className="cg-btn small" onClick={sendComment}>
                {String(s.roomSend)}
              </button>
            </div>
          )}
          <ul className="cg-comment-list">
            {comments.map((c) => (
              <li key={c.id} className="cg-comment">
                <div className="cg-comment-head">
                  <strong>{commentNames[c.user_id] ?? "…"}</strong>
                  <span className="cg-hint">
                    {lang === "vi" ? "nước" : "move"} {c.move_number}
                  </span>
                </div>
                <div>{c.body}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
