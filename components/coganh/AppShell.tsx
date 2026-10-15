"use client";
import React, { useEffect, useRef, useState } from "react";
import PlayView from "./PlayView";
import HowToView from "./HowToView";
import SetupView, { type SetupGame } from "./SetupView";
import CvCView from "./CvCView";
import { HistoryView } from "./HistoryView";
import { LeaderboardView } from "./LeaderboardView";
import { StatsView } from "./StatsView";
import { CheckinView } from "./CheckinView";
import RoomView, { roomErrText } from "./RoomView";
import FriendsView from "./FriendsView";
import CorrView from "./CorrView";
import { NotificationsView } from "./NotificationsView";
import { PushNudge, PushSettings } from "./PushSettings";
import LibraryView from "./LibraryView";
import PuzzleView from "./PuzzleView";
import { fetchNotifications } from "@/lib/supabase/notifications";
import { AuthModal } from "./AuthModal";
import { ProfileModal } from "./ProfileModal";
import { STR, loadLang, saveLang, type Lang } from "@/lib/coganh/i18n";
import { isMuted, setMuted } from "@/lib/coganh/sound";
import { AuthProvider, useAuth } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { joinRoom, roomErrorKey } from "@/lib/supabase/rooms";
import {
  fetchPendingChallenges,
  respondChallenge,
  subscribeChallenges,
  type Challenge,
} from "@/lib/supabase/friends";

type Mode =
  | "play" | "setup" | "cvc" | "rooms" | "friends" | "corr" | "inbox"
  | "library" | "puzzle"
  | "history" | "leaderboard" | "stats" | "checkin" | "howto";

function Shell() {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  const [mode, setMode] = useState<Mode>("play");
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [customGame, setCustomGame] = useState<(SetupGame & { nonce: number }) | null>(null);
  const [cvcGame, setCvcGame] = useState<SetupGame | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeToast, setChallengeToast] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [corrDeepLink, setCorrDeepLink] = useState<string | null>(null);
  const { user, profile, cgStats, displayName, signOut } = useAuth();
  const s = STR[lang] as Record<string, string | string[]>;
  const userId = user?.id ?? null;

  /* Invite link ?room=CODE → open the rooms mode with the code prefilled. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) {
      setInviteCode(code.toUpperCase());
      setMode("rooms");
    }
    const corr = params.get("corr");
    if (corr) {
      setCorrDeepLink(corr);
      setMode("corr");
    }
  }, []);

  /* Unread inbox badge. */
  const refreshUnread = () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    fetchNotifications()
      .then(({ unread }) => setUnreadCount(unread))
      .catch(() => {});
  };
  useEffect(() => {
    refreshUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* Incoming challenges: initial fetch + realtime subscription. */
  useEffect(() => {
    if (!userId) {
      setChallenge(null);
      return;
    }
    let dead = false;
    fetchPendingChallenges()
      .then(({ incoming }) => {
        if (!dead && incoming.length > 0) setChallenge(incoming[0]);
      })
      .catch(() => {});
    const ch = subscribeChallenges(
      userId,
      (c) => {
        if (!dead) setChallenge(c);
      },
      (name) => {
        if (!dead) {
          setChallengeToast(String(s.challengeDeclinedToast).replace("{name}", name));
          setTimeout(() => setChallengeToast(null), 5000);
        }
      }
    );
    return () => {
      dead = true;
      try {
        createClient().removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [userId]);

  const acceptChallenge = async (c: Challenge) => {
    setChallenge(null);
    try {
      // Join FIRST: if the room is full/closed/gone the challenge stays
      // pending (retryable) instead of being silently consumed.
      const room = await joinRoom(c.room_code);
      await respondChallenge(c.id, true).catch(() => {});
      setOpenRoomId(room.id);
      setMode("rooms");
    } catch (e) {
      // Never fail silently: explain and keep the challenge actionable.
      setChallengeToast(roomErrText(roomErrorKey(e), s));
      setTimeout(() => setChallengeToast(null), 5000);
      setChallenge(c);
      return;
    }
    try {
      const { incoming } = await fetchPendingChallenges();
      if (incoming.length > 0) setChallenge(incoming[0]);
    } catch {
      /* ignore */
    }
  };

  const declineChallenge = async (c: Challenge) => {
    setChallenge(null);
    try {
      await respondChallenge(c.id, false);
    } catch {
      /* ignore */
    }
  };

  const pickLang = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    setDrawer(false);
    setMenu(false);
  };
  const openLogin = () => {
    setMenu(false);
    setDrawer(false);
    setAuthOpen(true);
  };
  const startCustom = (g: SetupGame) => {
    setCustomGame({ ...g, nonce: Date.now() });
    setMode("play");
  };
  const startCvC = (g: SetupGame) => {
    setCvcGame(g);
    setMode("cvc");
  };

  const modes: { id: Mode; icon: string; label: string }[] = [
    { id: "play", icon: "🎮", label: String(s.playVsComputer) },
    { id: "setup", icon: "🧩", label: String(s.setupTitleCg) },
    { id: "rooms", icon: "🏠", label: String(s.room) },
    { id: "friends", icon: "👥", label: String(s.friends) },
    { id: "corr", icon: "📬", label: String(s.corrTitle) },
    { id: "library", icon: "📚", label: String(s.bikip) },
    { id: "puzzle", icon: "🧩", label: String(s.puzzle) },
    { id: "history", icon: "📜", label: String(s.history) },
    { id: "leaderboard", icon: "🏆", label: String(s.leaderboard) },
    { id: "stats", icon: "📊", label: String(s.stats) },
    { id: "checkin", icon: "📅", label: String(s.checkin) },
    { id: "howto", icon: "📖", label: String(s.howTo) },
  ];

  return (
    <div className="cg-page">
      <header className="cg-header">
        <div className="cg-topbar">
          <button className="cg-menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}>☰</button>
          <div className="cg-brand">
            <h1 className="cg-title">{String(s.appName)}</h1>
            <span className="cg-muted">{String(s.tagline)}</span>
          </div>
          <div className="cg-account">
            <div className="cg-user" role="group" aria-label="Account">
            {user && (
              <button className="cg-rating-chip" onClick={() => pickMode("leaderboard")} title={String(s.leaderboard)}>
                ⭐ {cgStats?.rating ?? 800}
              </button>
            )}
            {user ? (
              <button
                className="cg-avatar-btn"
                aria-label={displayName}
                onClick={() => setMenu((m) => !m)}
              >
                <span className="cg-account-avatar">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    (displayName || "P").slice(0, 1).toUpperCase()
                  )}
                </span>
                {unreadCount > 0 && <span className="cg-avatar-dot" aria-label={String(unreadCount)} />}
              </button>
            ) : (
              <button className="cg-gear-btn" aria-label={String(s.settings)} onClick={() => setMenu((m) => !m)}>⚙️</button>
            )}
            {menu && (
              <>
                <div className="cg-menu-backdrop" onClick={() => setMenu(false)} />
                <div className="cg-account-menu" role="menu">
                  {user ? (
                    <>
                      <div className="cg-account-menu-head">
                        <span className="cg-account-avatar large">
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt="" />
                          ) : (
                            "👤"
                          )}
                        </span>
                        <div className="cg-account-menu-id">
                          <strong>{displayName}</strong>
                          <span className="cg-muted">{profile?.username ? `@${profile.username}` : user.email}</span>
                        </div>
                      </div>
                      <button className="cg-btn" onClick={() => { setMenu(false); setProfileOpen(true); }}>
                        👤 {String(s.profile)}
                      </button>
                      <button className="cg-btn" onClick={() => pickMode("inbox")}>
                        {String(s.notifications)}
                        {unreadCount > 0 && (
                          <span className="cg-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                        )}
                      </button>
                      <button className="cg-btn" onClick={() => pickMode("checkin")}>
                        📅 {String(s.checkin)}
                      </button>
                      <PushSettings lang={lang} />
                    </>
                  ) : (
                    <button className="cg-btn cg-btn-primary" onClick={openLogin}>
                      🔑 {String(s.login)}
                    </button>
                  )}
                  <div className="cg-account-menu-settings">
                    <label>
                      {String(s.language)}
                      <select
                        className="cg-select"
                        value={lang}
                        onChange={(e) => pickLang(e.target.value as Lang)}
                      >
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label>
                      {String(s.sound)}
                      <input
                        type="checkbox"
                        checked={!muted}
                        onChange={(e) => {
                          const m = !e.target.checked;
                          setMuted(m);
                          setMutedState(m);
                        }}
                      />
                    </label>
                  </div>
                  {user && (
                    <button
                      className="cg-btn"
                      onClick={async () => { setMenu(false); await signOut(); }}
                    >
                      🚪 {String(s.logout)}
                    </button>
                  )}
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="cg-drawer-root">
          <div className="cg-backdrop" onClick={() => setDrawer(false)} />
          <nav className="cg-drawer" aria-label="Modes">
            <div className="cg-drawer-head">
              <strong>{String(s.appName)}</strong>
              <button className="cg-btn-icon" aria-label="Close" onClick={() => setDrawer(false)}>✕</button>
            </div>
            <div className="cg-drawer-body">
              <div className="cg-drawer-modes">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    className={`cg-btn${mode === m.id ? " cg-btn-primary" : ""}`}
                    onClick={() => pickMode(m.id)}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <div className="cg-drawer-legal">
                <a href="/privacy">{String(s.privacy)}</a> · <a href="/terms">{String(s.terms)}</a>
              </div>
            </div>
          </nav>
        </div>
      )}

      {challenge && (
        <div className="cg-challenge-banner" role="alert">
          <span>
            {String(s.challengeFrom).replace("{name}", challenge.challenger_name ?? "…")}
          </span>
          <button type="button" className="cg-btn small cg-btn-primary" onClick={() => void acceptChallenge(challenge)}>
            {String(s.challengeAccept)}
          </button>
          <button type="button" className="cg-btn small" onClick={() => void declineChallenge(challenge)}>
            {String(s.challengeDecline)}
          </button>
        </div>
      )}
      {challengeToast && <div className="cg-challenge-toast">{challengeToast}</div>}
      {user && <PushNudge lang={lang} />}

        {mode === "play" && <PlayView lang={lang} custom={customGame} onLogin={openLogin} />}
        {mode === "setup" && (
          <SetupView lang={lang} user={user} onLogin={openLogin} onPlay={startCustom} onCvC={startCvC} />
        )}
        {mode === "cvc" && cvcGame && (
          <CvCView lang={lang} game={cvcGame} user={user} onBack={() => setMode("setup")} />
        )}
        {mode === "rooms" && (
          <RoomView
            lang={lang}
            user={user}
            inviteCode={inviteCode}
            onConsumeInvite={() => setInviteCode(null)}
            onLogin={openLogin}
            openRoomId={openRoomId}
          />
        )}
        {mode === "friends" &&
          (user ? (
            <FriendsView
              lang={lang}
              userId={user.id}
              myName={displayName}
              onAcceptChallenge={acceptChallenge}
            />
          ) : (
            <div className="cg-scroll-area">
              <div className="cg-view">
                <h2>{String(s.friends)}</h2>
                <div className="cg-panel">
                  <p className="cg-hint">{String(s.loginToViewHistory)}</p>
                  <button type="button" className="cg-btn cg-btn-primary" onClick={openLogin}>
                    {String(s.login)}
                  </button>
                </div>
              </div>
            </div>
          ))}
        {mode === "corr" && (
          <CorrView lang={lang} userId={userId} onLogin={openLogin} deepLinkGameId={corrDeepLink} />
        )}
        {mode === "inbox" && <NotificationsView lang={lang} onChanged={refreshUnread} />}
        {mode === "library" && <LibraryView lang={lang} userId={userId} />}
        {mode === "puzzle" && <PuzzleView lang={lang} userId={userId} onLogin={openLogin} />}
        {mode === "history" && <HistoryView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "leaderboard" && <LeaderboardView lang={lang} myUserId={user?.id ?? null} />}
        {mode === "stats" && <StatsView lang={lang} />}
        {mode === "checkin" && <CheckinView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "howto" && <HowToView lang={lang} />}
      <footer className="cg-footer">{String(s.footer)}</footer>

      <AuthModal lang={lang} open={authOpen} onClose={() => setAuthOpen(false)} />
      <ProfileModal lang={lang} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default function AppShell() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
