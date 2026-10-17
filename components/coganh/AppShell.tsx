"use client";
import React, { useEffect, useRef, useState } from "react";
import PlayView, { type PlayActions } from "./PlayView";
import SiteFooter from "./SiteFooter";
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
import { STR, loadLang, saveLang, levelName, type Lang } from "@/lib/coganh/i18n";
import type { Color } from "@/lib/coganh/engine";
import { isMuted, setMuted } from "@/lib/coganh/sound";
import { AuthProvider, useAuth } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { joinRoom, roomErrorKey } from "@/lib/supabase/rooms";
import { fireEvent } from "@/lib/supabase/notify";
import {
  fetchPendingChallenges,
  respondChallenge,
  sendChallenge,
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
  const [authMode, setAuthMode] = useState<"in" | "up">("in");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [level, setLevelState] = useState<number>(() => {
    try { return Math.min(12, Math.max(1, Number(localStorage.getItem("cg-level")) || 5)); }
    catch { return 5; }
  });
  const [humanColor, setHumanColorState] = useState<Color>(() => {
    try { return localStorage.getItem("cg-side") === "red" ? "red" : "blue"; }
    catch { return "blue"; }
  });
  const [puzzleTab, setPuzzleTab] = useState<"daily" | "community">("daily");
  const actionsRef = useRef<PlayActions | null>(null);
  const [actionsVersion, setActionsVersion] = useState(0);
  const notifyActions = () => setActionsVersion((v) => v + 1);
  const [profileOpen, setProfileOpen] = useState(false);
  const [customGame, setCustomGame] = useState<(SetupGame & { nonce: number }) | null>(null);
  const [cvcGame, setCvcGame] = useState<SetupGame | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeToast, setChallengeToast] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [corrDeepLink, setCorrDeepLink] = useState<string | null>(null);
  /* Hub deep link ?challenge=<handle>: an OUTGOING challenge to that player. */
  const [hubChallengeHandle, setHubChallengeHandle] = useState<string | null>(null);
  const [hubChallengeTarget, setHubChallengeTarget] = useState<{ id: string; name: string } | null>(null);
  const [hubChallengeBusy, setHubChallengeBusy] = useState(false);
  const [hubChallengeMsg, setHubChallengeMsg] = useState<string | null>(null);
  /** SynerWorlds one-tap login hand-off: ?sso=<magic-link token hash>. */
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const { user, profile, cgStats, displayName, signOut, sessionExpired, dismissSessionExpired } = useAuth();
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);
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
    // From the SynerWorlds hub (profile page / Tìm đối thủ board):
    // ?challenge=<handle> asks to challenge that player. A 36-char UUID
    // would be an incoming-challenge id (no such handler here) — anything
    // else is a player handle.
    const chl = params.get("challenge");
    if (chl && !/^[0-9a-f-]{36}$/i.test(chl)) {
      setHubChallengeHandle(chl.toLowerCase());
      const u = new URL(window.location.href);
      u.searchParams.delete("challenge");
      window.history.replaceState({}, "", u.toString());
    }
    // From the SynerWorlds hub: ?sso=<magic-link token hash> is a one-time
    // login hand-off. Single-use — strip it so a refresh never retries.
    const sso = params.get("sso");
    if (sso) {
      setSsoToken(sso);
      const u = new URL(window.location.href);
      u.searchParams.delete("sso");
      window.history.replaceState({}, "", u.toString());
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
      },
      (c, name) => {
        // My challenge was accepted: the accepter is already entering
        // the room — bring me in too, no manual room hunt (user request).
        if (dead) return;
        setChallengeToast(String(s.challengeAcceptedToast).replace("{name}", name));
        setTimeout(() => setChallengeToast(null), 5000);
        if (c.room_id) {
          setOpenRoomId(c.room_id);
          setMode("rooms");
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
      // Notify the challenger (push + inbox) — fired from the accepter's
      // client because the trigger route verifies the caller IS the
      // challenged player; the challenger may not even be online.
      void fireEvent("challenge_accepted", { challenge: c.id });
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
      void fireEvent("challenge_declined", { challenge: c.id });
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
  const openAuth = (m: "in" | "up") => {
    setAuthMode(m);
    setMenu(false);
    setDrawer(false);
    setAuthOpen(true);
  };
  const openLogin = () => openAuth("in");

  /* Hub challenge deep link: prompt login first if needed, resolve the
   * handle to a player, then ask for confirmation before sending. */
  useEffect(() => {
    if (!hubChallengeHandle) return;
    if (!userId) {
      openLogin();
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from("profiles")
        .select("id, full_name, username")
        .eq("handle", hubChallengeHandle)
        .maybeSingle();
      if (cancelled) return;
      setHubChallengeHandle(null);
      if (!data) {
        setHubChallengeMsg(String(s.hubChallengeNotFound));
        return;
      }
      const row = data as { id: string; full_name: string | null; username: string | null };
      if (row.id === userId) return; // own profile link — ignore silently
      const name = row.full_name?.trim() || row.username?.trim() || "Player";
      setHubChallengeTarget({ id: row.id, name });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubChallengeHandle, userId]);

  const doHubChallenge = async () => {
    if (!hubChallengeTarget || hubChallengeBusy) return;
    setHubChallengeBusy(true);
    setHubChallengeMsg(null);
    try {
      const ch = await sendChallenge(hubChallengeTarget.id, displayName);
      setHubChallengeTarget(null);
      // Same entry path as ?room=: the room view joins by invite code.
      if (ch.room_code) {
        setInviteCode(ch.room_code.toUpperCase());
        setMode("rooms");
      }
    } catch {
      setHubChallengeMsg(String(s.hubChallengeError));
    } finally {
      setHubChallengeBusy(false);
    }
  };

  useEffect(() => {
    if (!hubChallengeMsg) return;
    const t = setTimeout(() => setHubChallengeMsg(null), 4500);
    return () => clearTimeout(t);
  }, [hubChallengeMsg]);

  /* Session ended on its own (expired / refresh failed): say so. */
  useEffect(() => {
    if (!sessionExpired) return;
    setExpiredMsg(String(s.sessionExpired));
    const t = setTimeout(() => {
      setExpiredMsg(null);
      dismissSessionExpired();
    }, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpired]);

  // Hub one-tap login: redeem the one-time token; the auth listener picks
  // the session up from there. Failures are said out loud (toast), never
  // swallowed — the player can still sign in manually.
  useEffect(() => {
    if (!ssoToken) return;
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { error } = await sb.auth.verifyOtp({
        token_hash: ssoToken,
        type: "magiclink",
      });
      if (cancelled) return;
      setSsoToken(null);
      if (error) setHubChallengeMsg(String(s.ssoError));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoToken]);
  const setLevel = (v: number) => {
    setLevelState(v);
    try { localStorage.setItem("cg-level", String(v)); } catch { /* noop */ }
  };
  const applySide = (c: Color) => {
    setHumanColorState(c);
    try { localStorage.setItem("cg-side", c); } catch { /* noop */ }
    setCustomGame(null);
  };
  const swapSides = () => applySide(humanColor === "blue" ? "red" : "blue");
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setMutedState(m);
  };
  const startCustom = (g: SetupGame) => {
    // Custom positions are played as Blue (the setup editor picks the side
    // to move, not the human's colour).
    setHumanColorState("blue");
    try { localStorage.setItem("cg-side", "blue"); } catch { /* noop */ }
    setCustomGame({ ...g, nonce: Date.now() });
    setMode("play");
  };
  const startCvC = (g: SetupGame) => {
    setCvcGame(g);
    setMode("cvc");
  };

  /* Drawer mode list — PacClone's order (§4 of the shell spec): play,
     puzzle, library, setup, history, leaderboard, rooms, corr, checkin,
     community. CG extras keep their closest slots: stats rides with the
     leaderboard, howto closes the list. Friends and Notifications are NOT
     in the drawer — they live in the avatar menu. */
  const drawerItems: { key: string; label: string; active: boolean; onPick: () => void }[] = [
    { key: "play", label: String(s.playVsComputer), active: mode === "play", onPick: () => pickMode("play") },
    { key: "puzzle", label: String(s.puzzle), active: mode === "puzzle" && puzzleTab === "daily", onPick: () => { setPuzzleTab("daily"); pickMode("puzzle"); } },
    { key: "library", label: String(s.bikip), active: mode === "library", onPick: () => pickMode("library") },
    { key: "setup", label: String(s.setupTitleCg), active: mode === "setup", onPick: () => pickMode("setup") },
    { key: "history", label: String(s.history), active: mode === "history", onPick: () => pickMode("history") },
    { key: "leaderboard", label: String(s.leaderboard), active: mode === "leaderboard", onPick: () => pickMode("leaderboard") },
    { key: "stats", label: `📊 ${String(s.stats)}`, active: mode === "stats", onPick: () => pickMode("stats") },
    { key: "rooms", label: String(s.room), active: mode === "rooms", onPick: () => pickMode("rooms") },
    { key: "corr", label: `✉️ ${String(s.corrTitle)}`, active: mode === "corr", onPick: () => pickMode("corr") },
    { key: "checkin", label: `📅 ${String(s.checkin)}`, active: mode === "checkin", onPick: () => pickMode("checkin") },
    { key: "community", label: String(s.community), active: mode === "puzzle" && puzzleTab === "community", onPick: () => { setPuzzleTab("community"); pickMode("puzzle"); } },
    { key: "howto", label: `📖 ${String(s.howTo)}`, active: mode === "howto", onPick: () => pickMode("howto") },
  ];

  const actions = actionsRef.current;
  void actionsVersion; // re-read actionsRef after PlayView publishes its actions

  /* Settings block shared by both identity menus (PacClone §5): language
     segmented toggle + sound toggle (+ push settings when logged in). */
  const renderSettings = (includePush: boolean) => (
    <div className="cg-account-menu-settings">
      <div className="cg-seg" role="group" aria-label={String(s.language)}>
        <button type="button" className={lang === "vi" ? "active" : ""} onClick={() => pickLang("vi")}>Tiếng Việt</button>
        <button type="button" className={lang === "en" ? "active" : ""} onClick={() => pickLang("en")}>English</button>
      </div>
      <button type="button" className="cg-btn" onClick={toggleMute}>
        {muted ? "🔇" : "🔊"} {String(s.sound)}
      </button>
      {includePush && <PushSettings lang={lang} />}
    </div>
  );

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
                          <span className="cg-muted">{user.email}</span>
                        </div>
                      </div>
                      <button className="cg-btn" onClick={() => { setMenu(false); setProfileOpen(true); }}>
                        {String(s.profile)}
                      </button>
                      <button className="cg-btn" onClick={() => pickMode("inbox")}>
                        {String(s.notifications)}
                        {unreadCount > 0 && (
                          <span className="cg-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                        )}
                      </button>
                      <button className="cg-btn" onClick={() => pickMode("friends")}>
                        {String(s.friends)}
                      </button>
                      <button
                        className="cg-btn"
                        onClick={() => setSettingsOpen((o) => !o)}
                        aria-expanded={settingsOpen}
                      >
                        ⚙️ {String(s.settings)} {settingsOpen ? "▾" : "▸"}
                      </button>
                      {settingsOpen && renderSettings(true)}
                      <button
                        className="cg-btn"
                        onClick={async () => { setMenu(false); await signOut(); }}
                      >
                        🚪 {String(s.logout)}
                      </button>
                    </>
                  ) : (
                    <>
                      {renderSettings(false)}
                      <button className="cg-btn cg-btn-primary" onClick={() => openAuth("in")}>
                        🔑 {String(s.login)}
                      </button>
                      <button className="cg-btn" onClick={() => openAuth("up")}>
                        {String(s.authSignup)}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            </div>
          </div>
        </div>
        {mode === "play" && (
          <div className="cg-quick">
            <button type="button" className="cg-btn" disabled={!actions?.canUndo} onClick={() => actions?.undo()}>
              {String(s.undo)}
            </button>
            <button type="button" className="cg-btn" disabled={!actions?.canSwap} onClick={() => actions?.swapSides()}>
              {String(s.switchSides)}
            </button>
            <button type="button" className="cg-btn" disabled={!actions?.canHint} onClick={() => actions?.hint()}>
              {actions?.hintThinking ? String(s.hintThinking) : String(s.hint)}
            </button>
            <span className="cg-quick-spacer" />
            <button type="button" className="cg-btn cg-btn-primary" onClick={() => actions?.newGame()}>
              {String(s.newGame)}
            </button>
          </div>
        )}
      </header>

      {drawer && (
        <div className="cg-drawer-root">
          <div className="cg-backdrop" onClick={() => setDrawer(false)} />
          <nav className="cg-drawer" aria-label="Modes">
            <div className="cg-drawer-head">
              <strong>{String(s.menu)}</strong>
              <button className="cg-btn-icon" aria-label={String(s.close)} onClick={() => setDrawer(false)}>✕</button>
            </div>
            <div className="cg-drawer-body">
              <section>
                <h2>{String(s.mode)}</h2>
                <div className="cg-drawer-modes">
                  {drawerItems.map((m) => (
                    <button
                      key={m.key}
                      className={`cg-btn${m.active ? " cg-btn-primary" : ""}`}
                      onClick={m.onPick}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </section>
              {mode === "play" && (
                <section>
                  <h2>{String(s.playSettings)}</h2>
                  <label className="cg-field">
                    {String(s.level)}
                    <select
                      className="cg-select"
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => (
                        <option key={l} value={l}>{levelName(lang, l)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cg-field">
                    {String(s.youPlay)}
                    <select
                      className="cg-select"
                      value={humanColor}
                      onChange={(e) => applySide(e.target.value as Color)}
                    >
                      <option value="blue">{String(s.sideBlue)}</option>
                      <option value="red">{String(s.sideRed)}</option>
                    </select>
                  </label>
                </section>
              )}
              <div className="cg-drawer-legal">
                <a href="/terms" target="_blank" rel="noreferrer">{String(s.termsOfService)}</a>
                <span> · </span>
                <a href="/privacy" target="_blank" rel="noreferrer">{String(s.privacyPolicy)}</a>
                <span> · </span>
                <a href="/data-deletion" target="_blank" rel="noreferrer">{String(s.dataDeletion)}</a>
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
      {expiredMsg && <div className="cg-challenge-toast">{expiredMsg}</div>}
      {hubChallengeTarget && (
        <div className="cg-modal-root" onClick={() => !hubChallengeBusy && setHubChallengeTarget(null)}>
          <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{String(s.hubChallengeTitle).replace("{name}", hubChallengeTarget.name)}</h2>
            {hubChallengeMsg && (
              <p style={{ color: "var(--red, #d4382c)", margin: "0 0 8px" }} role="alert">
                {hubChallengeMsg}
              </p>
            )}
            <div className="cg-modal-actions">
              <button
                type="button"
                className="cg-btn cg-btn-primary"
                disabled={hubChallengeBusy}
                onClick={() => void doHubChallenge()}
              >
                {String(s.hubChallengeSend)}
              </button>
              <button
                type="button"
                className="cg-btn"
                disabled={hubChallengeBusy}
                onClick={() => setHubChallengeTarget(null)}
              >
                {String(s.hubChallengeLater)}
              </button>
            </div>
          </div>
        </div>
      )}
      {hubChallengeMsg && !hubChallengeTarget && (
        <div className="cg-challenge-toast">{hubChallengeMsg}</div>
      )}
      {user && <PushNudge lang={lang} />}

        {mode === "play" && (
          <PlayView
            lang={lang}
            level={level}
            humanColor={humanColor}
            custom={customGame}
            onLogin={openLogin}
            onSwapSides={swapSides}
            actionsRef={actionsRef}
            notifyActions={notifyActions}
          />
        )}
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
        {mode === "puzzle" && <PuzzleView lang={lang} userId={userId} onLogin={openLogin} initialTab={puzzleTab} />}
        {mode === "history" && <HistoryView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "leaderboard" && <LeaderboardView lang={lang} myUserId={user?.id ?? null} />}
        {mode === "stats" && <StatsView lang={lang} />}
        {mode === "checkin" && <CheckinView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "howto" && <HowToView lang={lang} />}
      <SiteFooter lang={lang} className="cg-footer" />

      <AuthModal lang={lang} open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
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
