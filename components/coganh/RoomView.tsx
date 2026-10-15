"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/coganh/i18n";
import {
  closeRoom,
  createRoom,
  fetchHotRooms,
  fetchNames,
  fetchPastMatches,
  fetchRoom,
  fetchRoomMembers,
  getActiveMatch,
  getLastFinishedMatch,
  joinRoom,
  kickMember,
  leaveRoom,
  listMyRooms,
  listPublicRooms,
  roomErrorKey,
  setMemberRole,
  setRoomPublic,
  setTurnOrder,
  startNextMatch,
  subscribeRoom,
  subscribeRoomMatches,
  updateRoomRules,
  type HotRoom,
  type PublicRoom,
  type Room,
  type RoomMatch,
  type RoomMember,
} from "@/lib/supabase/rooms";
import { createClient } from "@/lib/supabase/client";
import { usePagination, Pagination } from "./Pagination";
import RoomMatchView from "./RoomMatchView";
import TournamentView from "./TournamentView";
import GuestRooms from "./GuestRooms";
import { FriendButton } from "./FriendsView";

interface RoomViewProps {
  lang: Lang;
  user: { id: string } | null;
  inviteCode: string | null;
  onConsumeInvite: () => void;
  onLogin: () => void;
  openRoomId?: string | null;
}

const MAX_PLAYERS_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

export function roomErrText(key: string, s: Record<string, string | string[]>): string {
  const map: Record<string, string> = {
    room_not_found: "roomErrNotFound",
    room_full: "roomErrFull",
    room_closed: "roomErrClosed",
    not_leader: "roomErrNotLeader",
    leader_cannot_leave: "roomErrLeaderCannotLeave",
    leader_must_play: "roomErrLeaderMustPlay",
    cannot_kick_self: "roomErrCannotKickSelf",
    room_need_two_players: "roomErrNeedTwoPlayers",
    match_in_progress: "roomErrMatchInProgress",
    match_not_found: "roomErrMatchNotFound",
    not_allowed: "roomErrNotAllowed",
    not_enough_players: "roomErrNotEnoughPlayers",
    tournament_in_progress: "roomErrTournInProgress",
    tournament_finished: "roomErrTournFinished",
    tournament_not_found: "roomErrTournNotFound",
    invalid_role: "roomErrInvalidRole",
  };
  return String(s[map[key] ?? "roomErrGeneric"] ?? s.roomErrGeneric);
}

function fmtDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US");
}

export default function RoomView({
  lang,
  user,
  inviteCode,
  onConsumeInvite,
  onLogin,
  openRoomId,
}: RoomViewProps) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [roomId, setRoomId] = useState<string | null>(openRoomId ?? null);
  const [tab, setTab] = useState<"mine" | "public" | "hot">("mine");
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [hotRooms, setHotRooms] = useState<HotRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // create form
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [isPublic, setIsPublic] = useState(false);
  // join form
  const [code, setCode] = useState("");
  const inviteConsumed = useRef<string | null>(null);

  const loadLists = useCallback(async () => {
    try {
      const [mine, pub, hot] = await Promise.all([
        listMyRooms().catch(() => [] as Room[]),
        listPublicRooms().catch(() => [] as PublicRoom[]),
        fetchHotRooms().catch(() => [] as HotRoom[]),
      ]);
      setMyRooms(mine);
      setPublicRooms(pub);
      setHotRooms(hot);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadLists();
  }, [user, loadLists]);

  // Deep-link / challenge entry point from the parent.
  useEffect(() => {
    if (openRoomId && openRoomId !== roomId) setRoomId(openRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRoomId]);

  // Invite code while logged in (e.g. logged in from the guest invite
  // card): join and open the room, then consume the code.
  useEffect(() => {
    if (!user || !inviteCode || inviteConsumed.current === inviteCode) return;
    inviteConsumed.current = inviteCode;
    (async () => {
      setError(null);
      try {
        const room = await joinRoom(inviteCode);
        setRoomId(room.id);
      } catch (e) {
        setError(roomErrText(roomErrorKey(e), s));
      } finally {
        onConsumeInvite();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, inviteCode]);

  if (!user) {
    return <GuestRooms lang={lang} inviteCode={inviteCode} onLogin={onLogin} />;
  }

  if (roomId) {
    return (
      <RoomDetail
        roomId={roomId}
        lang={lang}
        userId={user.id}
        onBack={() => {
          setRoomId(null);
          void loadLists();
        }}
      />
    );
  }

  const doCreate = async () => {
    setError(null);
    try {
      const room = await createRoom(
        name.trim().slice(0, 60) || (lang === "vi" ? "Phòng chơi" : "Game room"),
        isPublic,
        maxPlayers
      );
      setName("");
      setRoomId(room.id);
    } catch (e) {
      setError(roomErrText(roomErrorKey(e), s));
    }
  };

  const doJoin = async () => {
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{6}$/.test(c)) {
      setError(roomErrText("room_not_found", s));
      return;
    }
    setError(null);
    try {
      const room = await joinRoom(c);
      setCode("");
      setRoomId(room.id);
    } catch (e) {
      setError(roomErrText(roomErrorKey(e), s));
    }
  };

  const roomRow = (r: { id: string; name: string; member_count?: number; max_players?: number; has_active_match?: boolean; matches_7d?: number }, key: string) => (
    <li key={key}>
      <button
        type="button"
        className="cg-room-row-btn"
        onClick={() => setRoomId(r.id)}
      >
        <span className="cg-lb-name">
          {r.has_active_match ? (
            <span className="cg-live-badge">{String(s.roomLive)}</span>
          ) : null}{" "}
          {r.name}
        </span>
        <span className="cg-hint">
          {r.member_count ?? ""}
          {r.max_players ? `/${r.max_players}` : ""}
          {r.matches_7d !== undefined ? ` · ${r.matches_7d} ⚔️` : ""}
        </span>
      </button>
    </li>
  );

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <h2>{String(s.room)}</h2>
        {error && <p className="cg-setup-error">{error}</p>}

        <div className="cg-panel">
          <h3>{String(s.roomCreate)}</h3>
          <label className="cg-field">
            {String(s.roomName)}
            <input
              className="cg-input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={String(s.roomNamePlaceholder)}
            />
          </label>
          <label className="cg-field">
            {String(s.roomMaxPlayers)}
            <select
              className="cg-select"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {MAX_PLAYERS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="cg-check-toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            {String(s.roomPublic)}
          </label>
          <div className="cg-actions">
            <button
              className="cg-btn cg-btn-primary"
              onClick={doCreate}
            >
              {String(s.roomCreateBtn)}
            </button>
          </div>
        </div>

        <div className="cg-panel">
          <h3>{String(s.roomJoinTitle)}</h3>
          <div className="cg-comment-form">
            <input
              className="cg-input cg-code-input"
              value={code}
              maxLength={6}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder={String(s.roomJoinCode)}
            />
            <button className="cg-btn small" onClick={doJoin}>
              {String(s.roomJoinBtn)}
            </button>
          </div>
        </div>

        <div className="cg-tabs">
          <button
            type="button"
            className={tab === "mine" ? "active" : ""}
            onClick={() => setTab("mine")}
          >
            {String(s.roomMyRooms)}
          </button>
          <button
            type="button"
            className={tab === "public" ? "active" : ""}
            onClick={() => setTab("public")}
          >
            {String(s.roomPublicLobby)}
          </button>
          <button
            type="button"
            className={tab === "hot" ? "active" : ""}
            onClick={() => setTab("hot")}
          >
            {String(s.roomHotRooms)}
          </button>
        </div>

        {loading ? (
          <p className="cg-empty-note">…</p>
        ) : (
          <>
            {tab === "mine" &&
              (myRooms.length === 0 ? (
                <p className="cg-empty-note">{String(s.roomNoRooms)}</p>
              ) : (
                <ul className="cg-board-list">
                  {myRooms.map((r) =>
                    roomRow(
                      {
                        id: r.id,
                        name: r.name,
                        max_players: r.max_players,
                      },
                      r.id
                    )
                  )}
                </ul>
              ))}
            {tab === "public" &&
              (publicRooms.length === 0 ? (
                <p className="cg-empty-note">{String(s.roomNoRooms)}</p>
              ) : (
                <ul className="cg-board-list">
                  {publicRooms.map((r) => roomRow(r, r.id))}
                </ul>
              ))}
            {tab === "hot" &&
              (hotRooms.length === 0 ? (
                <p className="cg-empty-note">{String(s.roomNoRooms)}</p>
              ) : (
                <ul className="cg-board-list">
                  {hotRooms.map((r) =>
                    roomRow(
                      {
                        id: r.room_id,
                        name: r.name,
                        member_count: r.member_count,
                        matches_7d: r.matches_7d,
                      },
                      r.room_id
                    )
                  )}
                </ul>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================ RoomDetail ============================ */

function RoomDetail({
  roomId,
  lang,
  userId,
  onBack,
}: {
  roomId: string;
  lang: Lang;
  userId: string;
  onBack: () => void;
}) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [activeMatch, setActiveMatch] = useState<RoomMatch | null>(null);
  const [viewedMatch, setViewedMatch] = useState<RoomMatch | null>(null);
  const [pastMatches, setPastMatches] = useState<RoomMatch[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rulesDraft, setRulesDraft] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [kicked, setKicked] = useState(false);
  const initialized = useRef(false);
  // A match the user deliberately exited (← back to lobby): polling
  // must not yank them straight back in. A NEW match still follows.
  const dismissedMatchId = useRef<string | null>(null);
  const { page, pageCount, pageItems, setPage } = usePagination(pastMatches, 10);

  const load = useCallback(async () => {
    try {
      const [r, ms, active, past] = await Promise.all([
        fetchRoom(roomId),
        fetchRoomMembers(roomId),
        getActiveMatch(roomId),
        fetchPastMatches(roomId, 50),
      ]);
      setRoom(r);
      setMembers(ms);
      setActiveMatch(active);
      if (active && dismissedMatchId.current !== active.id) {
        // Follow only from the lobby (prev === null): never yank a
        // user who is watching a finished match or another view.
        setViewedMatch((prev) => (prev ? prev : active));
      }
      setPastMatches(past);
      if (r) setRulesDraft(r.rules ?? "");
      const ids = new Set<string>();
      for (const m of ms) ids.add(m.user_id);
      if (r) {
        for (const id of r.turn_order) ids.add(id);
        if (r.leader_id) ids.add(r.leader_id);
      }
      const all = [active, ...past].filter(Boolean) as RoomMatch[];
      for (const m of all) {
        if (m.blue_id) ids.add(m.blue_id);
        if (m.red_id) ids.add(m.red_id);
      }
      const n = await fetchNames([...ids]).catch(() => ({}));
      setNames(n);
      if (!initialized.current) {
        initialized.current = true;
        if (active) {
          setViewedMatch(active);
        } else {
          const last = await getLastFinishedMatch(roomId).catch(() => null);
          if (last) setViewedMatch(last);
        }
      }
    } catch {
      /* polling/load is best-effort */
    }
  }, [roomId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    const chRoom = subscribeRoom(roomId, {
      myUserId: userId,
      onChange: () => void load(),
      onKicked: () => setKicked(true),
    });
    const chMatches = subscribeRoomMatches(roomId, (m) => {
      // Auto-follow a brand-new match (start / rematch / tournament).
      setActiveMatch(m.status === "active" ? m : null);
      setViewedMatch(m);
      void load();
    });
    return () => {
      clearInterval(t);
      try {
        const c = createClient();
        c.removeChannel(chRoom);
        c.removeChannel(chMatches);
      } catch {
        /* ignore */
      }
    };
  }, [roomId, userId, load]);

  if (kicked) {
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <div className="cg-panel">
            <p>{String(s.roomKicked)}</p>
            <button className="cg-btn" onClick={onBack}>
              {String(s.roomBackToRoom)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <p className="cg-empty-note">…</p>
        </div>
      </div>
    );
  }

  const isLeader = room.leader_id === userId;
  const myMember = members.find((m) => m.user_id === userId);

  const handleMatchChange = (m: RoomMatch) => {
    setViewedMatch(m);
    setActiveMatch((prev) => {
      if (m.status === "active") return m;
      return prev && prev.id === m.id ? null : prev;
    });
  };

  const copy = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  const inviteLink =
    typeof location !== "undefined"
      ? `${location.origin}/?room=${room.code}`
      : `?room=${room.code}`;

  const act = async (fn: () => Promise<unknown>, key?: string) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(key ? roomErrText(roomErrorKey(e), s) : String(s.roomErrGeneric));
    }
  };

  const moveInOrder = (uid: string, dir: -1 | 1) => {
    const order = [...(room.turn_order ?? [])];
    const i = order.indexOf(uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void act(() => setTurnOrder(roomId, order));
  };

  const nextPair =
    room.turn_order && room.turn_order.length >= 2
      ? [room.turn_order[0], room.turn_order[1]]
      : null;

  const matchNames = (m: RoomMatch) => ({
    blue: m.blue_id ? (names[m.blue_id] ?? "…") : String(s.blueSide),
    red: m.red_id ? (names[m.red_id] ?? "…") : String(s.redSide),
  });

  const resultIcon = (m: RoomMatch) => {
    if (m.result === "draw") return "🤝";
    if (m.result === "red") return "🔴";
    if (m.result === "blue") return "🔵";
    return "⚔️";
  };

  // Full-bleed match view (a direct child of .cg-page, like PlayView)
  // so the board's aspect-locked sizing gets a definite height. Nesting
  // .cg-layout inside .cg-view breaks the height:100% chain and the
  // board collapses/letterboxes.
  if (viewedMatch) {
    return (
      <RoomMatchView
        key={viewedMatch.id}
        match={viewedMatch}
        roomId={roomId}
        lang={lang}
        userId={userId}
        guest={false}
        names={matchNames(viewedMatch)}
        onExit={() => {
          dismissedMatchId.current = viewedMatch.id;
          setViewedMatch(null);
        }}
        onMatchChange={handleMatchChange}
      />
    );
  }

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <button type="button" className="cg-btn small" onClick={onBack}>
          {String(s.roomBackToRoom)}
        </button>
        <h2>{room.name}</h2>
        {error && <p className="cg-setup-error">{error}</p>}
        {room.status === "closed" && (
          <p className="cg-hint">🔒 {String(s.roomErrClosed)}</p>
        )}

        <>
          {activeMatch && (
              <div className="cg-panel">
                <div className="cg-lb-row">
                  <span className="cg-lb-name">
                    <span className="cg-live-badge">
                      {String(s.roomLive)}
                    </span>{" "}
                    {matchNames(activeMatch).blue} vs{" "}
                    {matchNames(activeMatch).red}
                  </span>
                  <button
                    type="button"
                    className="cg-btn small cg-btn-primary"
                    onClick={() => setViewedMatch(activeMatch)}
                  >
                    ▶
                  </button>
                </div>
              </div>
            )}

            <div className="cg-panel cg-room-code-card">
              <div className="cg-room-code-big">{room.code}</div>
              <div className="cg-actions">
                <button
                  type="button"
                  className="cg-btn small"
                  onClick={() => copy(room.code)}
                >
                  {String(s.roomCopyCode)}
                </button>
                <button
                  type="button"
                  className="cg-btn small"
                  onClick={() => copy(inviteLink)}
                >
                  {String(s.roomCopyLink)}
                </button>
              </div>
              {copied && <p className="cg-hint">{String(s.roomCopied)}</p>}
            </div>

            <div className="cg-panel">
              <h3>{String(s.roomRules)}</h3>
              {isLeader ? (
                <>
                  <textarea
                    className="cg-input cg-textarea"
                    value={rulesDraft}
                    maxLength={500}
                    rows={3}
                    onChange={(e) => {
                      setRulesDraft(e.target.value);
                      setRulesSaved(false);
                    }}
                    placeholder={String(s.roomRulesPlaceholder)}
                  />
                  <div className="cg-actions">
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() =>
                        act(() => updateRoomRules(roomId, rulesDraft)).then(
                          () => setRulesSaved(true)
                        )
                      }
                    >
                      {String(s.roomSave)}
                    </button>
                    {rulesSaved && (
                      <span className="cg-hint">
                        {String(s.roomRulesSaved)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="cg-hint">{room.rules || "—"}</p>
              )}
            </div>

            <div className="cg-panel">
              <h3>
                👥 {String(s.roomTurnOrder)} ({members.length}/{room.max_players})
              </h3>
              <p className="cg-hint">{String(s.roomTurnOrderHint)}</p>
              <ul className="cg-member-list">
                {members.map((m) => {
                  const pos = (room.turn_order ?? []).indexOf(m.user_id);
                  const other = m.user_id !== userId;
                  return (
                    <li key={m.user_id} className="cg-lb-row">
                      <span className="cg-lb-name">
                        {m.user_id === room.leader_id && (
                          <span title={String(s.roomLeader)}>👑 </span>
                        )}
                        {pos >= 0 && (
                          <span className="cg-hint">#{pos + 1} </span>
                        )}
                        {m.role === "spectator" ? "👀 " : ""}
                        {names[m.user_id] ?? "…"}
                        <span className="cg-hint">
                          {" "}
                          ·{" "}
                          {m.role === "player"
                            ? String(s.roomPlayer)
                            : String(s.roomSpectator)}
                        </span>
                      </span>
                      <span className="cg-row-actions">
                        {other && (
                          <FriendButton
                            lang={lang}
                            userId={userId}
                            otherId={m.user_id}
                          />
                        )}
                        {isLeader && other && (
                          <>
                            <button
                              type="button"
                              className="cg-btn small cg-btn-icon"
                              title="▲"
                              onClick={() => moveInOrder(m.user_id, -1)}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="cg-btn small cg-btn-icon"
                              title="▼"
                              onClick={() => moveInOrder(m.user_id, 1)}
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              className="cg-btn small"
                              title={
                                m.role === "player"
                                  ? String(s.roomMakeSpectator)
                                  : String(s.roomMakePlayer)
                              }
                              onClick={() =>
                                act(() =>
                                  setMemberRole(
                                    roomId,
                                    m.user_id,
                                    m.role === "player"
                                      ? "spectator"
                                      : "player"
                                  )
                                )
                              }
                            >
                              {m.role === "player" ? "👀" : "🎮"}
                            </button>
                            <button
                              type="button"
                              className="cg-btn small"
                              title={String(s.roomKick)}
                              onClick={() =>
                                act(() => kickMember(roomId, m.user_id))
                              }
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="cg-panel">
              <div className="cg-actions">
                {isLeader ? (
                  <>
                    {nextPair && (
                      <span className="cg-hint">
                        {names[nextPair[0]] ?? "…"} vs{" "}
                        {names[nextPair[1]] ?? "…"}
                      </span>
                    )}
                    <button
                      type="button"
                      className="cg-btn cg-btn-primary"
                      disabled={!!activeMatch || room.status === "closed"}
                      onClick={() =>
                        act(async () => {
                          const m = await startNextMatch(roomId);
                          dismissedMatchId.current = null;
                          setActiveMatch(m);
                          setViewedMatch(m);
                        }, "start")
                      }
                    >
                      {String(s.roomStartMatch)}
                    </button>
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() =>
                        act(() => setRoomPublic(roomId, !room.is_public))
                      }
                    >
                      {room.is_public ? "🔒" : "🌐"}{" "}
                      {String(s.roomPublic).replace("🌐 ", "")}
                    </button>
                    <button
                      type="button"
                      className={`cg-btn small${
                        closeArmed ? " cg-btn-danger" : ""
                      }`}
                      onClick={() => {
                        if (!closeArmed) {
                          setCloseArmed(true);
                          setTimeout(() => setCloseArmed(false), 3500);
                          return;
                        }
                        setCloseArmed(false);
                        void act(() => closeRoom(roomId));
                      }}
                    >
                      {closeArmed
                        ? String(s.roomCloseConfirm)
                        : String(s.roomClose)}
                    </button>
                  </>
                ) : (
                  myMember && (
                    <button
                      type="button"
                      className={`cg-btn small${
                        leaveArmed ? " cg-btn-danger" : ""
                      }`}
                      onClick={() => {
                        if (!leaveArmed) {
                          setLeaveArmed(true);
                          setTimeout(() => setLeaveArmed(false), 3500);
                          return;
                        }
                        setLeaveArmed(false);
                        act(() => leaveRoom(roomId)).then(onBack);
                      }}
                    >
                      {leaveArmed
                        ? String(s.roomLeaveConfirm)
                        : String(s.roomLeave)}
                    </button>
                  )
                )}
              </div>
            </div>

            <TournamentView
              roomId={roomId}
              lang={lang}
              isLeader={isLeader}
            />

            <div className="cg-panel">
              <h3>{String(s.roomPastMatches)}</h3>
              {pastMatches.length === 0 ? (
                <p className="cg-empty-note">{String(s.roomMatchEmpty)}</p>
              ) : (
                <>
                  <ul className="cg-board-list">
                    {pageItems.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="cg-room-row-btn"
                          onClick={() => setViewedMatch(m)}
                        >
                          <span className="cg-lb-name">
                            {resultIcon(m)} {matchNames(m).blue} vs{" "}
                            {matchNames(m).red}
                          </span>
                          <span className="cg-hint">
                            {String(s.roomPlies).replace(
                              "{n}",
                              String(m.moves.length)
                            )}{" "}
                            · {fmtDate(m.finished_at ?? m.created_at ?? "", lang)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onPage={setPage}
                  />
                </>
              )}
            </div>
          </>
      </div>
    </div>
  );
}
