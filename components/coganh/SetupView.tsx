"use client";
import React, { useEffect, useMemo, useState } from "react";
import Board from "./Board";
import { Pagination, usePagination } from "./Pagination";
import {
  boardFromString, boardToString, countPieces, initialBoard,
  type Board as BoardState, type Color,
} from "@/lib/coganh/engine";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { createClient } from "@/lib/supabase/client";

export interface SetupGame {
  position: string;
  turn: Color;
}

interface SavedSetup {
  id: string;
  name: string;
  position: string;
  side_to_move: Color;
  created_at: string;
}

interface Props {
  lang: Lang;
  user: { id: string } | null;
  onLogin: () => void;
  onPlay: (g: SetupGame) => void;
  onCvC: (g: SetupGame) => void;
}

const LS_KEY = "cg-saved-setups";

function loadGuestSetups(): SavedSetup[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedSetup[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function SetupView({ lang, user, onLogin, onPlay, onCvC }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [cells, setCells] = useState<BoardState>(() => initialBoard());
  const [turn, setTurn] = useState<Color>("blue");
  const [name, setName] = useState("");
  const [setups, setSetups] = useState<SavedSetup[]>([]);
  const [msg, setMsg] = useState("");
  const { page, setPage, pageCount, pageItems } = usePagination(setups, 5);

  const blues = countPieces(cells, "blue");
  const reds = countPieces(cells, "red");
  const valid = blues >= 1 && reds >= 1;
  const position = useMemo(() => boardToString(cells), [cells]);

  const refresh = async () => {
    if (!user) {
      setSetups(loadGuestSetups());
      return;
    }
    try {
      const sb = createClient();
      const { data } = await sb
        .from("cg_setups")
        .select("id,name,position,side_to_move,created_at")
        .order("created_at", { ascending: false });
      if (Array.isArray(data)) setSetups(data as SavedSetup[]);
    } catch { /* table may not exist yet */ }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const cycle = (i: number) => {
    setCells((prev) => {
      const next = prev.slice();
      next[i] = next[i] === null ? "blue" : next[i] === "blue" ? "red" : null;
      return next;
    });
  };

  const save = async () => {
    const setupName = name.trim() || (lang === "vi" ? `Thế cờ ${setups.length + 1}` : `Setup ${setups.length + 1}`);
    if (!valid) { setMsg(String(s.setupNeedBoth)); return; }
    if (!user) {
      const entry: SavedSetup = {
        id: `local-${Date.now()}`,
        name: setupName,
        position,
        side_to_move: turn,
        created_at: new Date().toISOString(),
      };
      const next = [entry, ...loadGuestSetups()];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      setSetups(next);
      setName("");
      return;
    }
    try {
      const sb = createClient();
      const { error } = await sb.from("cg_setups").insert({
        user_id: user.id, name: setupName, position, side_to_move: turn,
      });
      if (error) throw error;
      setName("");
      refresh();
    } catch {
      setMsg(lang === "vi" ? "Lưu không thành công — bạn đã chạy migration 001 chưa?" : "Save failed — has migration 001 been run?");
    }
  };

  const remove = async (id: string) => {
    if (!user) {
      const next = loadGuestSetups().filter((x) => x.id !== id);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      setSetups(next);
      return;
    }
    try {
      const sb = createClient();
      await sb.from("cg_setups").delete().eq("id", id);
      refresh();
    } catch { /* noop */ }
  };

  const load = (entry: SavedSetup) => {
    setCells(boardFromString(entry.position));
    setTurn(entry.side_to_move);
  };

  return (
    <div className="cg-layout">
        <div className="cg-board-area">
          <div className="cg-board-fit">
            <Board board={cells} selected={null} targets={[]} lastMove={null} flipped={[]} onPoint={cycle} />
          </div>
        </div>
        <aside className="cg-panel">
          <h2>🧩 {String(s.setupTitleCg)}</h2>
          <p className="cg-hint">
            {lang === "vi"
              ? "Chạm vào một điểm để đổi: trống → Xanh → Đỏ → trống."
              : "Tap a point to cycle: empty → Blue → Red → empty."}
          </p>
          <div className="cg-stat-cards">
            <div className="cg-stat-card">🔵 {String(s.blueSide)}: <strong>{blues}</strong></div>
            <div className="cg-stat-card">🔴 {String(s.redSide)}: <strong>{reds}</strong></div>
          </div>
          <label className="cg-field">
            {String(s.sideToMoveLabel)}
            <select className="cg-select" value={turn} onChange={(e) => setTurn(e.target.value as Color)}>
              <option value="blue">🔵 {String(s.blueSide)}</option>
              <option value="red">🔴 {String(s.redSide)}</option>
            </select>
          </label>
          <div className="cg-buttons">
            <button className="cg-btn cg-btn-primary" disabled={!valid} onClick={() => onPlay({ position, turn })}>
              ▶ {String(s.playFromHere)}
            </button>
            <button className="cg-btn" disabled={!valid} onClick={() => onCvC({ position, turn })}>
              🤖 {String(s.computerVsComputer)}
            </button>
            <button className="cg-btn" onClick={() => setCells(Array(25).fill(null))}>{String(s.clearBoard)}</button>
            <button className="cg-btn" onClick={() => { setCells(initialBoard()); setTurn("blue"); }}>
              {String(s.resetBoard)}
            </button>
          </div>
          {!valid && <p className="cg-hint">⚠️ {String(s.setupNeedBoth)}</p>}
          {msg && <p className="cg-hint">{msg}</p>}
          <h3>💾 {String(s.savedSetups)}</h3>
          <div className="cg-buttons">
            <input
              className="cg-code-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={String(s.setupName)}
              maxLength={40}
            />
            <button className="cg-btn" onClick={save}>{String(s.saveSetup)}</button>
          </div>
          {setups.length === 0 ? (
            <p className="cg-muted">{lang === "vi" ? "Chưa có thế cờ nào được lưu." : "No saved setups yet."}</p>
          ) : (
            <>
              <ul className="cg-board-list">
                {pageItems.map((entry) => (
                  <li key={entry.id} className="cg-lb-row">
                    <span className="cg-lb-name">
                      {entry.name} · {entry.side_to_move === "blue" ? "🔵" : "🔴"}
                    </span>
                    <button className="cg-btn small" onClick={() => load(entry)}>{String(s.loadSetupLabel)}</button>
                    <button className="cg-btn small" onClick={() => remove(entry.id)}>{String(s.deleteSetupLabel)}</button>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} />
            </>
          )}
          {!user && (
            <p className="cg-hint">
              {lang === "vi"
                ? "Khách: thế cờ lưu trên máy này. Đăng nhập để đồng bộ."
                : "Guests: setups are stored on this device. Log in to sync."}{" "}
              <button className="cg-btn small" onClick={onLogin}>{String(s.login)}</button>
            </p>
          )}
        </aside>
    </div>
  );
}
