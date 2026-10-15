"use client";

import { useEffect, useState } from "react";
import { roomErrorKey } from "@/lib/supabase/rooms";
import { roomErrText } from "./RoomView";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { levelForXp } from "@/lib/coganh/levels";
import {
  cancelChallenge,
  fetchPendingChallenges,
  follow,
  isFollowing,
  listFriends,
  respondChallenge,
  searchUsers,
  sendChallenge,
  unfollow,
  type Challenge,
  type Friend,
} from "@/lib/supabase/friends";

/** Compact follow toggle used in room member lists. */
export function FriendButton({
  lang,
  userId,
  otherId,
}: {
  lang: Lang;
  userId: string;
  otherId: string;
}) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [following, setFollowing] = useState<boolean | null>(null);
  useEffect(() => {
    let dead = false;
    isFollowing(userId, otherId)
      .then((v) => {
        if (!dead) setFollowing(v);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [userId, otherId]);
  if (following === null) return null;
  const toggle = () => {
    (following ? unfollow(userId, otherId) : follow(userId, otherId))
      .then(() => setFollowing(!following))
      .catch(() => {});
  };
  return (
    <button
      type="button"
      className={`cg-btn small${following ? "" : " cg-btn-primary"}`}
      onClick={toggle}
      title={following ? String(s.friendsUnfollow) : String(s.friendsFollow)}
    >
      {following ? String(s.friendsFollowing) : `＋ ${String(s.friendsFollow)}`}
    </button>
  );
}

interface Props {
  lang: Lang;
  userId: string;
  myName: string;
  onAcceptChallenge: (c: Challenge) => Promise<void>;
}

export default function FriendsView({
  lang,
  userId,
  myName,
  onAcceptChallenge,
}: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [outgoing, setOutgoing] = useState<Challenge[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  /** Visible failure line (role=alert) — a failed action must NEVER be
   *  silent; the old bare catches hid the broken challenge flow. */
  const [actionError, setActionError] = useState("");

  const loadFriends = async () => {
    try {
      setFriends(await listFriends(userId));
    } catch {
      /* best-effort */
    }
  };
  const loadChallenges = async () => {
    try {
      const { incoming: i, outgoing: o } = await fetchPendingChallenges();
      setIncoming(i);
      setOutgoing(o);
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    void loadFriends();
    void loadChallenges();
    const t = setInterval(loadChallenges, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchUsers(query, userId));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, userId]);

  const toggleFollow = (f: Friend, following: boolean) => {
    setActionError("");
    (following ? unfollow(userId, f.user_id) : follow(userId, f.user_id))
      .then(loadFriends)
      .catch(() => setActionError(String(s.friendsActionError)));
  };

  const onChallenge = async (f: Friend) => {
    setActionError("");
    try {
      await sendChallenge(f.user_id, myName);
      setNotice(String(s.challengeSent));
      setTimeout(() => setNotice(null), 2500);
      await loadChallenges();
    } catch {
      setActionError(String(s.friendsActionError));
    }
  };

  const onAccept = async (c: Challenge) => {
    setActionError("");
    try {
      // AppShell joins the room, marks the challenge accepted and
      // navigates — in that order, throwing with the room reason when
      // the join fails so the challenge stays pending and retryable.
      await onAcceptChallenge(c);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setActionError(roomErrText(roomErrorKey(e), s));
    }
  };

  const onDecline = async (c: Challenge) => {
    setActionError("");
    try {
      await respondChallenge(c.id, false);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setActionError(String(s.friendsActionError));
    }
  };

  const onCancel = async (c: Challenge) => {
    setActionError("");
    try {
      await cancelChallenge(c.id);
      setOutgoing((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setActionError(String(s.friendsActionError));
    }
  };

  const friendIds = new Set(friends.map((f) => f.user_id));

  /** Avatar + name + level chip — the family-standard friend row. */
  const friendIdentity = (f: Friend) => (
    <span className="cg-lb-name cg-friend-id">
      {f.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.avatar_url} alt="" className="cg-friend-avatar" />
      ) : (
        <span className="cg-friend-avatar cg-friend-avatar-fallback">
          {(f.name.trim()[0] ?? "👤").toUpperCase()}
        </span>
      )}
      {f.name}
      <span className="cg-hint">⭐ {f.rating} · Lv {levelForXp(f.xp)}</span>
    </span>
  );

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <h2>{String(s.friendsTitle)}</h2>
        {notice && <div className="cg-xp-toast">{notice}</div>}
        {actionError && (
          <p role="alert" className="cg-error">
            {actionError}
          </p>
        )}

        {incoming.length > 0 && (
          <div className="cg-panel">
            <h3>{String(s.challengeIncoming)}</h3>
            <ul className="cg-board-list">
              {incoming.map((c) => (
                <li key={c.id} className="cg-lb-row">
                  <span className="cg-lb-name">
                    {String(s.challengeFrom).replace(
                      "{name}",
                      c.challenger_name ?? "?"
                    )}{" "}
                    <span className="cg-hint">
                      {String(s.challengeRoomCode).replace(
                        "{code}",
                        c.room_code
                      )}
                    </span>
                  </span>
                  <span className="cg-row-actions">
                    <button
                      type="button"
                      className="cg-btn small cg-btn-primary"
                      onClick={() => void onAccept(c)}
                    >
                      {String(s.challengeAccept)}
                    </button>
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() => void onDecline(c)}
                    >
                      {String(s.challengeDecline)}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="cg-panel">
            <h3>
              {String(s.challengeOutgoing)} ({String(s.challengePending)})
            </h3>
            <ul className="cg-board-list">
              {outgoing.map((c) => (
                <li key={c.id} className="cg-lb-row">
                  <span className="cg-lb-name">{c.challenged_name}</span>
                  <span className="cg-row-actions">
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() => void onCancel(c)}
                    >
                      {String(s.challengeCancel)}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="cg-panel">
          <h3>{String(s.friendsSearch)}</h3>
          <input
            className="cg-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={String(s.friendsSearch)}
          />
          {searching && <p className="cg-hint">…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="cg-empty-note">{String(s.friendsNoResults)}</p>
          )}
          <ul className="cg-board-list">
            {results.map((f) => {
              const following = friendIds.has(f.user_id);
              return (
                <li key={f.user_id} className="cg-lb-row">
                  {friendIdentity(f)}
                  <span className="cg-row-actions">
                    <button
                      type="button"
                      className="cg-btn small cg-btn-primary"
                      onClick={() => void onChallenge(f)}
                    >
                      {String(s.friendsChallenge)}
                    </button>
                    <button
                      type="button"
                      className={`cg-btn small${
                        following ? "" : " cg-btn-primary"
                      }`}
                      onClick={() => toggleFollow(f, following)}
                    >
                      {following
                        ? String(s.friendsFollowing)
                        : `＋ ${String(s.friendsFollow)}`}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="cg-panel">
          <h3>
            {String(s.friendsMyList)} ({friends.length})
          </h3>
          {friends.length === 0 ? (
            <p className="cg-empty-note">{String(s.friendsEmpty)}</p>
          ) : (
            <ul className="cg-board-list">
              {friends.map((f) => (
                <li key={f.user_id} className="cg-lb-row">
                  {friendIdentity(f)}
                  <span className="cg-row-actions">
                    <button
                      type="button"
                      className="cg-btn small cg-btn-primary"
                      onClick={() => void onChallenge(f)}
                    >
                      {String(s.friendsChallenge)}
                    </button>
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() => toggleFollow(f, true)}
                    >
                      {String(s.friendsUnfollow)}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!searching && query.trim().length < 2 && (
            <p className="cg-hint">{String(s.friendsSearchHint)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
