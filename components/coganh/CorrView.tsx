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
  createCorrGame,
  fetchMyCorrGames,
  finishCorrGame,
  getCorrGame,
  pushCorrMoves,
  subscribeCorrGame,
  type CorrGame,
} from "@/lib/supabase/corr";
import { fetchNames } from "@/lib/supabase/rooms";
import { listFriends, type Friend } from "@/lib/supabase/friends";
import { createClient } from "@/lib/supabase/client";
import { playCapture, playLose, playMove, playSelect, playWin } from "@/lib/coganh/sound";
import { STR, type Lang } from "@/lib/coganh/i18n";

interface Props {
  lang: Lang;
  userId: string | null;
  onLogin: () => void;
  deepLinkGameId?: string | null;
}

function fmtDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US");
}

const rot = (i: number) => 24 - i;

export default function CorrView({ lang, userId, onLogin, deepLinkGameId }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [games, setGames] = useState<CorrGame[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(deepLinkGameId ?? null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const gs = await fetchMyCorrGames();
      setGames(gs);
      const ids = new Set<string>();
      for (const g of gs) {
        ids.add(g.blue_id);
        ids.add(g.red_id);
      }
      const n = await fetchNames([...ids]).catch(() => ({}));
      setNames(n);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (deepLinkGameId) setOpenId(deepLinkGameId);
  }, [deepLinkGameId]);

  if (!userId) {
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <h2>{String(s.corrTitle)}</h2>
          <div className="cg-panel">
            <p className="cg-hint">{String(s.corrLoginTeaser)}</p>
            <button type="button" className="cg-btn cg-btn-primary" onClick={onLogin}>
              {String(s.login)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (openId) {
    return (
      <CorrGameScreen
        gameId={openId}
        lang={lang}
        userId={userId}
        names={names}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <h2>{String(s.corrTitle)}</h2>
        <div className="cg-actions">
          <button
            type="button"
            className="cg-btn cg-btn-primary"
            onClick={() => setShowNew((v) => !v)}
          >
            {String(s.corrNew)}
          </button>
        </div>
        {showNew && (
          <NewCorrGame
            lang={lang}
            userId={userId}
            onCreated={(g) => {
              setShowNew(false);
              setOpenId(g.id);
              void load();
            }}
          />
        )}
        {loading ? (
          <p className="cg-empty-note">…</p>
        ) : games.length === 0 ? (
          <p className="cg-empty-note">{String(s.corrEmpty)}</p>
        ) : (
          <ul className="cg-board-list">
            {games.map((g) => (
              <CorrGameRow key={g.id} game={g} lang={lang} userId={userId} names={names} onOpen={() => setOpenId(g.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CorrGameRow({
  game,
  lang,
  userId,
  names,
  onOpen,
}: {
  game: CorrGame;
  lang: Lang;
  userId: string;
  names: Record<string, string>;
  onOpen: () => void;
}) {
  const s = STR[lang] as Record<string, string | string[]>;
  const mySide = mySideInMatch(userId, game.blue_id, game.red_id);
  const oppId = mySide === "blue" ? game.red_id : game.blue_id;
  const turn = turnAtPly(game.moves.length);
  const myTurn = game.status === "active" && mySide !== null && mySide === turn;
  return (
    <li>
      <button type="button" className="cg-room-row-btn" onClick={onOpen}>
        <span className="cg-lb-name">
          {game.status === "active" && myTurn && (
            <span className="cg-live-badge">{String(s.corrYourMove)}</span>
          )}{" "}
          ⚔️ {names[oppId] ?? "…"}
        </span>
        <span className="cg-hint">
          {game.status === "active" ? String(s.corrActive) : String(s.corrFinished)} ·{" "}
          {fmtDate(game.updated_at, lang)}
        </span>
      </button>
    </li>
  );
}

function NewCorrGame({
  lang,
  userId,
  onCreated,
}: {
  lang: Lang;
  userId: string;
  onCreated: (g: CorrGame) => void;
}) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listFriends(userId)
      .then(setFriends)
      .catch(() => {});
  }, [userId]);
  const start = async (f: Friend) => {
    setBusy(true);
    try {
      const g = await createCorrGame(f.user_id);
      onCreated(g);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cg-panel">
      <h3>{String(s.corrPickFriend)}</h3>
      {friends.length === 0 ? (
        <p className="cg-empty-note">{String(s.corrNoFriends)}</p>
      ) : (
        <ul className="cg-board-list">
          {friends.map((f) => (
            <li key={f.user_id} className="cg-lb-row">
              <span className="cg-lb-name">{f.name}</span>
              <button
                type="button"
                className="cg-btn small cg-btn-primary"
                disabled={busy}
                onClick={() => void start(f)}
              >
                ▶
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================ game screen ============================ */

interface FinalResult {
  winner: Color | null;
  reason: string;
}

function CorrGameScreen({
  gameId,
  lang,
  userId,
  names,
  onBack,
}: {
  gameId: string;
  lang: Lang;
  userId: string;
  names: Record<string, string>;
  onBack: () => void;
}) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [game, setGame] = useState<CorrGame | null>(null);
  const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [resignArmed, setResignArmed] = useState(false);
  const finishGuard = useRef(false);

  useEffect(() => {
    let dead = false;
    getCorrGame(gameId)
      .then((g) => {
        if (!dead) setGame(g);
      })
      .catch(() => {});
    const ch = subscribeCorrGame(gameId, (g) => {
      if (!dead) setGame(g);
    });
    const t = setInterval(async () => {
      try {
        const g = await getCorrGame(gameId);
        if (!dead && g) setGame(g);
      } catch {
        /* best-effort */
      }
    }, 4000);
    return () => {
      dead = true;
      clearInterval(t);
      try {
        createClient().removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [gameId]);

  useEffect(() => {
    if (!resignArmed) return;
    const t = setTimeout(() => setResignArmed(false), 3500);
    return () => clearTimeout(t);
  }, [resignArmed]);

  const labels = pendingLabels ?? game?.moves ?? [];
  useEffect(() => {
    if (pendingLabels && game && game.moves.length >= pendingLabels.length) {
      setPendingLabels(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.moves.length, gameId]);

  const { states, plies } = useMemo(
    () =>
      game
        ? buildReplayStates({
            labels,
            startPos: game.start_pos || undefined,
            startTurn: "blue",
            title: "",
            subtitle: "",
          })
        : { states: [], plies: [] },
    [game, labels]
  );
  const cur = states.length > 0 ? states[states.length - 1] : null;
  const turn = turnAtPly(labels.length);
  const localStatus = useMemo(
    () => (cur ? gameStatus(cur, turn) : { over: false, winner: null as Color | null, reason: null as string | null }),
    [cur, turn]
  );
  const serverResult: FinalResult | null =
    game && game.status === "finished" && game.result
      ? game.result === "draw"
        ? { winner: null, reason: game.reason ?? "agreement" }
        : { winner: game.result as Color, reason: game.reason ?? "resign" }
      : null;
  const final: FinalResult | null =
    serverResult ??
    (localStatus.over ? { winner: localStatus.winner, reason: localStatus.reason ?? "flipped-all" } : null);
  const playing = !!game && game.status === "active" && !localStatus.over && !!cur;
  const mySide = game ? mySideInMatch(userId, game.blue_id, game.red_id) : null;
  const flip = mySide === "red";
  const legal = useMemo(
    () => (playing && cur ? legalMoves(cur, turn) : []),
    [playing, cur, turn]
  );
  const targets = useMemo(
    () => (sel === null ? [] : legal.filter((m) => m.from === sel).map((m) => m.to)),
    [legal, sel]
  );
  const lastMove: Move | null = plies.length > 0 ? plies[plies.length - 1].move : null;
  const lastFlips = plies.length > 0 ? plies[plies.length - 1].flips : [];

  const doFinish = async (result: "blue" | "red" | "draw", reason: string) => {
    if (finishGuard.current) return;
    finishGuard.current = true;
    try {
      await finishCorrGame(gameId, result, reason);
      void fireEvent("corr_end", { game: gameId });
      const g = await getCorrGame(gameId).catch(() => null);
      if (g) setGame(g);
    } catch {
      finishGuard.current = false;
    }
  };

  // Mover-side game-over detection (idempotent on the server).
  useEffect(() => {
    if (
      game &&
      game.status === "active" &&
      localStatus.over &&
      localStatus.winner !== null &&
      mySide &&
      !finishGuard.current
    ) {
      void doFinish(localStatus.winner, localStatus.reason ?? "flipped-all");
      if (localStatus.winner === mySide) playWin();
      else playLose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStatus, game?.status, gameId]);

  const doMove = (move: Move) => {
    if (!cur || !mySide || mySide !== turn) return;
    const applied = applyMove(cur, move, turn);
    const label = moveLabel(move, applied);
    const newLabels = [...labels, label];
    setPendingLabels(newLabels);
    setSel(null);
    if (applied.ganhFlips.length + applied.chetFlips.length > 0) playCapture();
    else playMove();
    pushCorrMoves(gameId, newLabels).catch(() => setPendingLabels(null));
    if (game) {
      const oppId = mySide === "blue" ? game.red_id : game.blue_id;
      if (oppId) void fireEvent("corr", { to: oppId, game: gameId });
    }
  };

  const onPointDisplay = (di: number) => {
    if (!playing || !cur || !mySide || mySide !== turn) return;
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

  if (!game || !cur) {
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <button type="button" className="cg-btn small" onClick={onBack}>
            {String(s.corrBackToList)}
          </button>
          <p className="cg-empty-note">…</p>
        </div>
      </div>
    );
  }

  const blueName = names[game.blue_id] ?? String(s.blueSide);
  const redName = names[game.red_id] ?? String(s.redSide);
  const turnName = turn === "blue" ? blueName : redName;
  const counts = { blue: countPieces(cur, "blue"), red: countPieces(cur, "red") };
  const dispBoard = flip ? cur.map((_, i) => cur[rot(i)]) : cur;
  const dispSel = sel === null ? null : flip ? rot(sel) : sel;
  const dispTargets = targets.map((to) => (flip ? rot(to) : to));
  const dispLast = lastMove ? (flip ? { from: rot(lastMove.from), to: rot(lastMove.to) } : lastMove) : null;
  const dispFlips = flip ? lastFlips.map(rot) : lastFlips;

  const reasonText = (r: FinalResult): string =>
    r.reason === "flipped-all"
      ? String(s.reasonFlippedAll)
      : r.reason === "no-moves"
        ? String(s.reasonNoMoves)
        : r.reason === "resign"
          ? String(s.reasonResign)
          : "";

  return (
    <>
      <div className="cg-backbar">
        <button type="button" className="cg-btn small" onClick={onBack}>
          {String(s.corrBackToList)}
        </button>
      </div>
      <div className="cg-layout">
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
          </div>
        </div>
        <div className="cg-panel">
          <div className="cg-vs-header">
            <span className="cg-vs-side blue">🔵 {blueName}</span>
            <span className="cg-vs-mid">⚔️</span>
            <span className="cg-vs-side red">🔴 {redName}</span>
          </div>

          {final ? (
            <div className="cg-gameover">
              <div className="cg-result">
                {final.winner === null
                  ? String(s.draw)
                  : final.winner === "blue"
                    ? String(s.blueWins)
                    : String(s.redWins)}
              </div>
              <div className="cg-reason">{reasonText(final)}</div>
              <button className="cg-btn cg-btn-primary" onClick={onBack}>
                {String(s.corrBackToList)}
              </button>
            </div>
          ) : (
            <div className="cg-status">
              <span
                className="cg-turn-dot"
                style={{ background: turn === "blue" ? "#2569b8" : "#cf3a30" }}
              />
              <span>
                {mySide === turn
                  ? String(s.corrYourMove)
                  : String(s.roomTurnOf).replace("{name}", turnName)}
              </span>
            </div>
          )}

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

          {playing && (
            <div className="cg-actions">
              <button
                className={`cg-btn${resignArmed ? " cg-btn-danger" : ""}`}
                onClick={onResign}
              >
                {resignArmed ? String(s.corrResignConfirm) : String(s.corrResign)}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
