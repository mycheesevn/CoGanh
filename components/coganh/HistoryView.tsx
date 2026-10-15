"use client";

import { useEffect, useState } from "react";
import { STR, levelShort, type Lang } from "@/lib/coganh/i18n";
import { fetchCgGames, type CgGameRow } from "@/lib/supabase/history";
import { useAuth } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { Pagination } from "./Pagination";
import { ReplayView } from "./ReplayView";
import { VideoExportModal, type CgVideoGame } from "./VideoExportModal";
import type { ReplayGame } from "@/lib/coganh/replay";

const PAGE_SIZE = 10;

interface Props {
  lang: Lang;
  user: { id: string } | null;
  onLogin: () => void;
}

function reasonLabel(reason: string | null, s: Record<string, string | string[]>): string {
  switch (reason) {
    case "flipped-all":
      return String(s.reasonFlippedAll);
    case "no-moves":
      return String(s.reasonNoMoves);
    case "resign":
      return String(s.reasonResign);
    default:
      return reason ?? "";
  }
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 260;
  const h = 48;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const stepX = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(h - 4 - ((p - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="cg-chart" role="img" aria-label="rating progress">
      <path d={d} fill="none" stroke="#e8a33d" strokeWidth={2} />
    </svg>
  );
}

export function HistoryView({ lang, user, onLogin }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { cgStats } = useAuth();
  const [rows, setRows] = useState<CgGameRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<number[]>([]);
  const [replay, setReplay] = useState<ReplayGame | null>(null);
  const [videoGame, setVideoGame] = useState<CgVideoGame | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCgGames(user.id, page, PAGE_SIZE)
      .then(({ rows, total }) => {
        setRows(rows);
        setTotal(total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, page]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.rpc("cg_rating_progress", { p_limit: 60 });
        if (Array.isArray(data)) {
          setRatings((data as { rating: number }[]).map((r) => r.rating));
        }
      } catch { /* sparkline is decorative */ }
    })();
  }, [user, cgStats?.games_played]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US");

  const openReplay = (g: CgGameRow) => {
    const isCvc = g.player_color === "cvc";
    const reason = reasonLabel(g.reason, s);
    setReplay({
      labels: g.moves ?? [],
      startPos: g.start_pos || undefined,
      startTurn: "blue",
      title: isCvc
        ? `🤖 ${String(s.cvcGame)}`
        : `${g.result === "win" ? "🎉" : g.result === "loss" ? "😞" : "🤝"} ${levelShort(lang, g.level)}`,
      subtitle: `${fmtDate(g.created_at)} · ${isCvc ? "" : `${reason} · `}${g.plies} ${lang === "vi" ? "nước" : "plies"}`,
    });
  };

  if (replay) {
    return (
      <>
        <ReplayView
          lang={lang}
          game={replay}
          onBack={() => setReplay(null)}
          onExportVideo={(g) => setVideoGame({ ...g })}
        />
        <VideoExportModal lang={lang} game={videoGame} onClose={() => setVideoGame(null)} />
      </>
    );
  }

  if (!user) {
    return (
      <div className="cg-scroll-area">
        <div className="cg-view">
          <h2>📜 {String(s.history)}</h2>
          <div className="cg-panel">
            <p className="cg-hint">{String(s.loginToViewHistory)}</p>
            <button type="button" className="cg-btn cg-btn-primary" onClick={onLogin}>
              {String(s.login)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <h2>📜 {String(s.history)}</h2>
        {cgStats && (
          <p className="cg-hint">
            🎉 {cgStats.wins} {String(s.wins)} · 😞 {cgStats.losses} {String(s.losses)} · 🤝{" "}
            {cgStats.draws} {String(s.draws)} · ⭐ {cgStats.rating}
          </p>
        )}
        {ratings.length >= 2 && (
          <div className="cg-panel">
            <strong>📈 {String(s.ratingProgress)}</strong>
            <Sparkline points={ratings} />
          </div>
        )}
        {loading ? (
          <p className="cg-empty-note">…</p>
        ) : rows.length === 0 ? (
          <p className="cg-empty-note">{String(s.historyEmpty)}</p>
        ) : (
          <>
            <ul className="cg-board-list">
              {rows.map((g) => {
                const reason = reasonLabel(g.reason, s);
                const isCvc = g.player_color === "cvc";
                const main = isCvc
                  ? `🤖 ${String(s.cvcGame)}`
                  : `${g.result === "win" ? "🎉" : g.result === "loss" ? "😞" : "🤝"} ${levelShort(lang, g.level)}`;
                const outcome = isCvc
                  ? g.result === "win"
                    ? `🏆 ${String(s.blueWins)}`
                    : g.result === "loss"
                      ? `🏆 ${String(s.redWins)}`
                      : `🤝 ${String(s.draws)}`
                  : reason;
                return (
                  <li key={g.id} className="cg-lb-row">
                    <span className="cg-lb-name">
                      {main}
                      {outcome ? ` · ${outcome}` : ""}
                      {` · ${g.plies} ${lang === "vi" ? "nước" : "plies"}`}
                    </span>
                    <span className="cg-lb-title">{fmtDate(g.created_at)}</span>
                    {(g.moves?.length ?? 0) > 0 && (
                      <button type="button" className="cg-btn small" onClick={() => openReplay(g)}>
                        {String(s.replay)}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
