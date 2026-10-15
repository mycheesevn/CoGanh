"use client";
import React, { useState } from "react";
import PlayView from "./PlayView";
import HowToView from "./HowToView";
import { STRINGS, loadLang, saveLang, type Lang } from "@/lib/coganh/i18n";
import { isMuted, setMuted } from "@/lib/coganh/sound";

type Mode = "play" | "howto";

export default function AppShell() {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  const [mode, setMode] = useState<Mode>("play");
  const [drawer, setDrawer] = useState(false);
  const [gear, setGear] = useState(false);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const s = STRINGS[lang];

  const pickLang = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    setDrawer(false);
  };

  return (
    <div className="cg-page">
      <header className="cg-header">
        <div className="cg-topbar">
          <button className="cg-menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}>☰</button>
          <div className="cg-brand">
            <h1 className="cg-title">{s.appName}</h1>
            <span className="cg-muted">{s.tagline}</span>
          </div>
          <div className="cg-account">
            <button className="cg-gear-btn" aria-label={s.settings} onClick={() => setGear((g) => !g)}>⚙️</button>
            {gear && (
              <>
                <div className="cg-menu-backdrop" onClick={() => setGear(false)} />
                <div className="cg-account-menu" role="menu">
                  <div className="cg-account-menu-head"><strong>{s.settings}</strong></div>
                  <div className="cg-account-menu-settings">
                    <label>
                      {s.language}
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
                      {s.sound}
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
              <strong>{s.appName}</strong>
              <button className="cg-btn-icon" aria-label="Close" onClick={() => setDrawer(false)}>✕</button>
            </div>
            <div className="cg-drawer-body">
              <div className="cg-drawer-modes">
                <button className="cg-btn" onClick={() => pickMode("play")}>🎮 {s.playVsComputer}</button>
                <button className="cg-btn" onClick={() => pickMode("howto")}>📖 {s.howTo}</button>
              </div>
              <div className="cg-drawer-legal">
                <a href="/privacy">{s.privacy}</a> · <a href="/terms">{s.terms}</a>
              </div>
            </div>
          </nav>
        </div>
      )}

      <main>
        {mode === "play" ? <PlayView s={s} /> : <HowToView lang={lang} />}
      </main>
      <footer className="cg-footer">{s.footer}</footer>
    </div>
  );
}
