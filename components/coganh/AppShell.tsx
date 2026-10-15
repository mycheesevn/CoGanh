"use client";
import React, { useState } from "react";
import PlayView from "./PlayView";
import HowToView from "./HowToView";
import SetupView, { type SetupGame } from "./SetupView";
import CvCView from "./CvCView";
import { HistoryView } from "./HistoryView";
import { LeaderboardView } from "./LeaderboardView";
import { StatsView } from "./StatsView";
import { CheckinView } from "./CheckinView";
import { AuthModal } from "./AuthModal";
import { ProfileModal } from "./ProfileModal";
import { STR, loadLang, saveLang, type Lang } from "@/lib/coganh/i18n";
import { isMuted, setMuted } from "@/lib/coganh/sound";
import { AuthProvider, useAuth } from "@/lib/supabase/auth";

type Mode = "play" | "setup" | "cvc" | "history" | "leaderboard" | "stats" | "checkin" | "howto";

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
  const { user, profile, cgStats, displayName, signOut } = useAuth();
  const s = STR[lang] as Record<string, string | string[]>;

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
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  <span>{(displayName || "P").slice(0, 1).toUpperCase()}</span>
                )}
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
                        <strong>{displayName}</strong>
                        <span className="cg-account-menu-id">{profile?.username ? `@${profile.username}` : user.email}</span>
                      </div>
                      <button className="cg-btn" onClick={() => { setMenu(false); setProfileOpen(true); }}>
                        👤 {String(s.profile)}
                      </button>
                      <button className="cg-btn" onClick={() => pickMode("checkin")}>
                        📅 {String(s.checkin)}
                      </button>
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

      <main>
        {mode === "play" && <PlayView lang={lang} custom={customGame} onLogin={openLogin} />}
        {mode === "setup" && (
          <SetupView lang={lang} user={user} onLogin={openLogin} onPlay={startCustom} onCvC={startCvC} />
        )}
        {mode === "cvc" && cvcGame && (
          <CvCView lang={lang} game={cvcGame} user={user} onBack={() => setMode("setup")} />
        )}
        {mode === "history" && <HistoryView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "leaderboard" && <LeaderboardView lang={lang} myUserId={user?.id ?? null} />}
        {mode === "stats" && <StatsView lang={lang} />}
        {mode === "checkin" && <CheckinView lang={lang} user={user} onLogin={openLogin} />}
        {mode === "howto" && <HowToView lang={lang} />}
      </main>
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
