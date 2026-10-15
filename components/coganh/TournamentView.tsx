"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/coganh/i18n";
import {
  cancelTournament,
  createTournament,
  listTournaments,
  standings,
  tournamentNextMatch,
  type Tournament,
} from "@/lib/supabase/tournaments";
import { fetchNames } from "@/lib/supabase/rooms";

interface Props {
  roomId: string;
  lang: Lang;
  isLeader: boolean;
}

export default function TournamentView({ roomId, lang, isLeader }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [endArmed, setEndArmed] = useState<string | null>(null);

  const load = async () => {
    try {
      const ts = await listTournaments(roomId);
      setTournaments(ts);
      const ids = [...new Set(ts.flatMap((t) => t.pairings.flatMap((p) => [p.blue, p.red])))];
      const n = await fetchNames(ids).catch(() => ({}));
      setNames(n);
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const onCreate = async () => {
    setError(null);
    try {
      await createTournament(roomId, name || (lang === "vi" ? "Giải đấu" : "Tournament"));
      setName("");
      await load();
    } catch (e) {
      setError(String(s.roomErrGeneric));
      void e;
    }
  };

  const onNext = async (t: Tournament) => {
    setError(null);
    try {
      await tournamentNextMatch(t.id);
      await load();
    } catch {
      setError(String(s.roomErrGeneric));
    }
  };

  const onEnd = async (t: Tournament) => {
    if (endArmed !== t.id) {
      setEndArmed(t.id);
      setTimeout(() => setEndArmed(null), 3500);
      return;
    }
    setEndArmed(null);
    try {
      await cancelTournament(t.id);
      await load();
    } catch {
      setError(String(s.roomErrGeneric));
    }
  };

  const resultLabel = (r: string | null) =>
    r === "red"
      ? "🔴"
      : r === "red"
        ? "🟢"
        : r === "draw"
          ? "🤝"
          : "…";

  return (
    <div className="cg-panel">
      <h3>{String(s.roomTournament)}</h3>
      {error && <p className="cg-setup-error">{error}</p>}
      {isLeader && (
        <div className="cg-comment-form">
          <input
            className="cg-input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={String(s.roomTournName)}
          />
          <button className="cg-btn small" onClick={onCreate}>
            {String(s.roomTournCreate)}
          </button>
        </div>
      )}
      {tournaments.length === 0 && (
        <p className="cg-empty-note">{String(s.roomMatchEmpty)}</p>
      )}
      {tournaments.map((t) => {
        const table = standings(t);
        const open = t.status === "open";
        const remaining = t.pairings.filter((p) => !p.result).length;
        return (
          <div key={t.id} className="cg-tournament">
            <div className="cg-tournament-head">
              <strong>{t.name}</strong>
              <span className="cg-hint">
                {open ? String(s.roomTournOpen) : String(s.roomTournFinished)}
              </span>
            </div>
            <table className="cg-standings">
              <thead>
                <tr>
                  <th>{String(s.player)}</th>
                  <th>{String(s.roomPoints)}</th>
                  <th>{String(s.wins)}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.player}>
                    <td>{names[row.player] ?? "…"}</td>
                    <td>{row.score}</td>
                    <td>{row.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="cg-pairings">
              {t.pairings.map((p, i) => (
                <li key={i} className="cg-pairing">
                  <span>
                    {names[p.blue] ?? "…"} vs {names[p.red] ?? "…"}
                  </span>
                  <span>{resultLabel(p.result)}</span>
                </li>
              ))}
            </ul>
            {isLeader && open && (
              <div className="cg-actions">
                {remaining > 0 && (
                  <button
                    className="cg-btn cg-btn-primary small"
                    onClick={() => void onNext(t)}
                  >
                    {String(s.roomTournNext)}
                  </button>
                )}
                <button
                  className={`cg-btn small${
                    endArmed === t.id ? " cg-btn-danger" : ""
                  }`}
                  onClick={() => void onEnd(t)}
                >
                  {endArmed === t.id
                    ? String(s.roomTournEndConfirm)
                    : String(s.roomTournEnd)}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
