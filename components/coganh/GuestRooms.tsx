"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/coganh/i18n";
import {
  fetchHotRooms,
  guestRoomDetail,
  listPublicRooms,
  previewRoom,
  type GuestRoomDetail,
  type HotRoom,
  type PublicRoom,
  type RoomMatch,
  type RoomPreview,
} from "@/lib/supabase/rooms";
import RoomMatchView from "./RoomMatchView";

interface Props {
  lang: Lang;
  inviteCode: string | null;
  onLogin: () => void;
}

function fmtDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US");
}

export default function GuestRooms({ lang, inviteCode, onLogin }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [invite, setInvite] = useState<RoomPreview | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [hotRooms, setHotRooms] = useState<HotRoom[]>([]);
  const [detail, setDetail] = useState<GuestRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [pub, hot] = await Promise.all([
          listPublicRooms().catch(() => [] as PublicRoom[]),
          fetchHotRooms().catch(() => [] as HotRoom[]),
        ]);
        if (!dead) {
          setPublicRooms(pub);
          setHotRooms(hot);
        }
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!inviteCode) {
      setInviteChecked(true);
      return;
    }
    let dead = false;
    (async () => {
      try {
        const p = await previewRoom(inviteCode).catch(() => null);
        if (!dead) setInvite(p);
      } finally {
        if (!dead) setInviteChecked(true);
      }
    })();
    return () => {
      dead = true;
    };
  }, [inviteCode]);

  const openDetail = async (roomId: string) => {
    const d = await guestRoomDetail(roomId).catch(() => null);
    if (d) setDetail(d);
  };

  // Guest view of the active match: construct a RoomMatch from the jsonb.
  const guestMatch: RoomMatch | null =
    detail?.active_match != null
      ? {
          id: detail.active_match.id,
          room_id: detail.id,
          blue_id: detail.active_match.blue_id,
          red_id: detail.active_match.red_id,
          status: detail.active_match.status,
          moves: Array.isArray(detail.active_match.moves)
            ? (detail.active_match.moves as string[])
            : [],
          start_pos: detail.active_match.start_pos,
          result: null,
          reason: null,
          winner_id: null,
        }
      : null;

  if (detail) {
    const blueName =
      detail.active_match?.blue_name ?? String(s.blueSide);
    const redName =
      detail.active_match?.red_name ?? String(s.redSide);
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <button
            type="button"
            className="cg-btn small"
            onClick={() => setDetail(null)}
          >
            {String(s.roomBackToRoom)}
          </button>
          <h2>{detail.name}</h2>
          <div className="cg-room-code-card">
            <span className="cg-hint">
              👥 {detail.member_count} {String(s.roomMembersCount)}
            </span>
          </div>
          <div className="cg-guest-banner">{String(s.guestSpectateBanner)}</div>
          {detail.rules && (
            <div className="cg-panel">
              <h3>{String(s.roomRules)}</h3>
              <p className="cg-hint">{detail.rules}</p>
            </div>
          )}
          <div className="cg-panel">
            <h3>👑 {String(s.roomLeader)}</h3>
            <ul className="cg-member-list">
              {detail.members.map((m, i) => (
                <li key={i} className="cg-lb-row">
                  <span className="cg-lb-name">
                    {m.role === "player" ? "" : "👀 "}
                    {m.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {guestMatch ? (
            <RoomMatchView
              match={guestMatch}
              roomId={detail.id}
              lang={lang}
              userId={null}
              guest={true}
              names={{ blue: blueName, red: redName }}
              onExit={() => setDetail(null)}
              onMatchChange={() => {}}
              onRequireLogin={onLogin}
            />
          ) : (
            <p className="cg-empty-note">{String(s.guestNoMatch)}</p>
          )}
          {detail.comments.length > 0 && (
            <div className="cg-panel">
              <h3>{String(s.roomComments)}</h3>
              <ul className="cg-comment-list">
                {detail.comments.map((c, i) => (
                  <li key={i} className="cg-comment">
                    <div className="cg-comment-head">
                      <strong>{c.user_name}</strong>
                      <span className="cg-hint">
                        {fmtDate(c.created_at, lang)}
                      </span>
                    </div>
                    <div>{c.body}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <h2>{String(s.room)}</h2>
        {inviteChecked && inviteCode && (
          <div className="cg-panel cg-invite-card">
            <h3>{String(s.guestInviteTitle)}</h3>
            {invite ? (
              <>
                <div className="cg-invite-name">{invite.name}</div>
                <p className="cg-hint">
                  👥 {invite.member_count} {String(s.roomMembersCount)}
                </p>
                {invite.rules && <p className="cg-hint">{invite.rules}</p>}
                <button
                  type="button"
                  className="cg-btn cg-btn-primary"
                  onClick={onLogin}
                >
                  {String(s.guestInviteJoin)}
                </button>
              </>
            ) : (
              <p className="cg-hint">{String(s.guestInviteInvalid)}</p>
            )}
          </div>
        )}
        <div className="cg-guest-teaser">
          <p>{String(s.roomLoginTeaser)}</p>
          <button
            type="button"
            className="cg-btn cg-btn-primary"
            onClick={onLogin}
          >
            {String(s.guestLogin)}
          </button>
        </div>
        {loading ? (
          <p className="cg-empty-note">…</p>
        ) : (
          <>
            <h3>{String(s.roomPublicLobby)}</h3>
            {publicRooms.length === 0 ? (
              <p className="cg-empty-note">{String(s.guestNoRooms)}</p>
            ) : (
              <ul className="cg-board-list">
                {publicRooms.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="cg-room-row-btn"
                      onClick={() => void openDetail(r.id)}
                    >
                      <span className="cg-lb-name">
                        {r.has_active_match && (
                          <span className="cg-live-badge">
                            {String(s.roomLive)}
                          </span>
                        )}{" "}
                        {r.name}
                      </span>
                      <span className="cg-hint">
                        {r.member_count}/{r.max_players}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hotRooms.length > 0 && (
              <>
                <h3>🔥 {String(s.roomHotRooms)}</h3>
                <ul className="cg-board-list">
                  {hotRooms.map((r) => (
                    <li key={r.room_id}>
                      <button
                        type="button"
                        className="cg-room-row-btn"
                        onClick={() => void openDetail(r.room_id)}
                      >
                        <span className="cg-lb-name">{r.name}</span>
                        <span className="cg-hint">
                          {r.matches_7d} · {r.member_count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
