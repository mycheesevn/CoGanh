"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/coganh/i18n";
import { LEVEL_THRESHOLDS, levelForXp, levelProgress } from "@/lib/coganh/levels";
import { ratingTitle } from "@/lib/coganh/rating";
import {
  fetchCgLeaderboard,
  type CgLeaderRow,
} from "@/lib/supabase/leaderboard";
import { useAuth } from "@/lib/supabase/auth";
import { renderShareCard, sharePng } from "@/lib/coganh/shareCard";
import { usePagination, Pagination } from "./Pagination";
import { StatsView } from "./StatsView";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

interface Props {
  lang: Lang;
  myUserId: string | null;
}

export function LeaderboardView({ lang, myUserId }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const { profile, cgStats } = useAuth();
  const [tab, setTab] = useState<"board" | "stats">("board");
  const [rows, setRows] = useState<CgLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    fetchCgLeaderboard(100)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { page, pageCount, pageItems, setPage } = usePagination(rows, 15);

  const myRow = myUserId ? rows.find((r) => r.user_id === myUserId) : null;

  // My-rank card data (PacClone anatomy): prefer my leaderboard row;
  // fall back to my own stats when I'm ranked below the fetched window.
  const myXp = myRow?.xp ?? cgStats?.xp ?? null;
  const myRating = myRow?.rating ?? cgStats?.rating ?? 800;
  const myPeak = myRow?.peak_rating ?? cgStats?.peak_rating ?? 800;
  const myWins = myRow?.wins ?? cgStats?.wins ?? 0;
  const myGames = myRow?.games_played ?? cgStats?.games_played ?? 0;
  const myName =
    myRow?.display_name ??
    profile?.full_name?.trim() ??
    profile?.username ??
    "";
  const prog = myXp !== null ? levelProgress(myXp) : null;
  const nextThreshold = prog ? LEVEL_THRESHOLDS[prog.level] : undefined;
  const winRate = myGames > 0 ? Math.round((myWins / myGames) * 100) : 0;

  const shareRank = async () => {
    if (sharing || !myRow || myXp === null) return;
    setSharing(true);
    try {
      const title = String(s.achRankTitle).replace(
        "{rank}",
        String(myRow.rank)
      );
      const blob = await renderShareCard({
        state: null,
        headline: title,
        subline: `${myName} · ⭐${myRating} ${ratingTitle(myRating, lang)} · Lv ${levelForXp(myXp)}`,
        appName:
          lang === "vi" ? "Cờ Gánh" : "Co Ganh",
        appUrl: "coganh.synerworlds.com",
      });
      const outcome = await sharePng(blob, title, myName);
      setShareToast(
        outcome === "shared"
          ? String(s.shareDone)
          : String(s.shareDownloaded)
      );
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* best-effort */
    } finally {
      setSharing(false);
    }
  };

  /** Avatar + name identity for a row (mirrors the Friends rows). */
  const identity = (r: CgLeaderRow) => (
    <span className="cg-friend-id">
      {r.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.avatar_url} alt="" className="cg-friend-avatar" />
      ) : (
        <span className="cg-friend-avatar cg-friend-avatar-fallback">
          {(r.display_name.trim()[0] ?? "👤").toUpperCase()}
        </span>
      )}
      <span>
        {r.display_name}
        {myUserId && r.user_id === myUserId ? ` (${String(s.you)})` : ""}
      </span>
    </span>
  );

  return (
    <div className="cg-scroll-area">
      <div className="cg-view">
        <div className="cg-lb-tabs">
          <button
            type="button"
            className={tab === "board" ? "active" : ""}
            onClick={() => setTab("board")}
          >
            🏆 {String(s.leaderboard)}
          </button>
          <button
            type="button"
            className={tab === "stats" ? "active" : ""}
            onClick={() => setTab("stats")}
          >
            📊 {String(s.statsTab)}
          </button>
        </div>

        {tab === "stats" ? (
          <StatsView lang={lang} />
        ) : loading ? (
          <p className="cg-empty-note">{String(s.loading)}</p>
        ) : (
          <>
            {!myUserId && (
              <p className="cg-empty-note">{String(s.leaderboardLogin)}</p>
            )}

            {myUserId && (myRow || cgStats) && prog && myXp !== null && (
              <section className="cg-lb-me-card">
                {shareToast && (
                  <div className="cg-xp-toast">{shareToast}</div>
                )}
                <div className="cg-lb-me-row">
                  <span className="cg-lb-me-label">
                    #{myRow?.rank ?? "–"} · {ratingTitle(myRating, lang)}
                  </span>
                  <span className="cg-lb-xp">⭐ {myRating}</span>
                  {myRow && (
                    <button
                      type="button"
                      className="cg-btn small"
                      onClick={() => void shareRank()}
                      disabled={sharing}
                      title={String(s.achShare)}
                      aria-label={String(s.achShare)}
                    >
                      📤
                    </button>
                  )}
                </div>
                <div className="cg-lb-me-row">
                  <span className="cg-lb-name">{myName}</span>
                  <span className="cg-hint">
                    Lv {prog.level}
                    {nextThreshold !== undefined
                      ? ` · ${String(s.xpToNext)
                          .replace("{xp}", String(nextThreshold - myXp))
                          .replace("{level}", String(prog.level + 1))}`
                      : ""}
                  </span>
                </div>
                <div
                  className="cg-progress"
                  role="progressbar"
                  aria-valuenow={Math.round(prog.prog * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="cg-progress-fill"
                    style={{ width: `${prog.prog * 100}%` }}
                  />
                </div>
                <div className="cg-lb-stats-row">
                  <span>
                    📈 {myPeak} {String(s.peakRating)}
                  </span>
                  <span>
                    🎯 {winRate}% {String(s.winRate)}
                  </span>
                  <span>
                    🏆 {myWins} {String(s.wins)}
                  </span>
                  <span>
                    🎮 {myGames} {String(s.games)}
                  </span>
                </div>
              </section>
            )}

            <h3 className="cg-lb-section">{String(s.topPlayers)}</h3>
            {rows.length === 0 ? (
              <p className="cg-empty-note">
                {String(s.leaderboardEmpty)}
              </p>
            ) : (
              <>
                <ol className="cg-board-list">
                  {pageItems.map((r) => {
                    const isMe = !!myUserId && r.user_id === myUserId;
                    return (
                      <li
                        key={r.user_id}
                        className={`cg-lb-row${isMe ? " cg-lb-me" : ""}`}
                      >
                        <span className="cg-lb-rank">
                          {RANK_MEDAL[r.rank - 1] ?? `#${r.rank}`}
                        </span>
                        <span className="cg-lb-main">
                          {identity(r)}
                          <span className="cg-lb-sub">
                            {ratingTitle(r.rating, lang)} · Lv{" "}
                            {levelForXp(r.xp)} · {r.wins} {String(s.wins)} ·{" "}
                            {r.games_played} {String(s.games)}
                          </span>
                        </span>
                        <span className="cg-lb-xp">⭐{r.rating}</span>
                      </li>
                    );
                  })}
                </ol>
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onPage={setPage}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
