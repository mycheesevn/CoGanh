"use client";

import { useEffect, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/coganh/i18n";
import {
  exportCgReplayVideo,
  type CgReplayVideoInput,
} from "@/lib/coganh/replayVideo";
import type { Color } from "@/lib/coganh/engine";

export interface CgVideoGame {
  /** Move labels as stored: cg move labels ("C3→C4"). */
  labels: string[];
  startPos?: string;
  startTurn?: Color;
  title: string;
  subtitle: string;
  shareUrl?: string;
}

interface Props {
  lang: Lang;
  game: CgVideoGame | null;
  onClose: () => void;
}

type Phase = "ready" | "recording" | "done" | "error";

/** Export a game replay as a shareable video clip (MP4 on Safari, WebM on Chrome). */
export function VideoExportModal({ lang, game, onClose }: Props) {
  const s = STR[lang] as Record<string, string>;
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopMic = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
      setMicError(false);
      return;
    }
    setMicError(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = ms;
      setMicOn(true);
    } catch {
      setMicError(true);
    }
  };

  useEffect(() => {
    if (game) {
      setPhase("ready");
      setProgress(0);
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      setFile(null);
    } else {
      abortRef.current?.abort();
      stopMic();
      setMicOn(false);
      setMicError(false);
    }
  }, [game]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopMic();
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, []);

  if (!game) return null;

  const startRecording = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("recording");
    setProgress(0);
    try {
      const input: CgReplayVideoInput = {
        labels: game.labels,
        startPos: game.startPos,
        startTurn: game.startTurn,
        title: game.title,
        subtitle: game.subtitle,
        lang,
        speed,
        micStream: micStreamRef.current,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      };
      const f = await exportCgReplayVideo(input);
      setFile(f);
      setVideoUrl(URL.createObjectURL(f));
      setPhase("done");
    } catch (e) {
      if (e instanceof Error && e.message === "cancelled") {
        setPhase("ready");
        setProgress(0);
      } else {
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const shareFile = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const url = game.shareUrl ?? window.location.origin;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: game.title,
          text: `${game.title}\n${game.subtitle}`,
          url,
        });
      } else {
        downloadFile();
        try {
          await navigator.clipboard.writeText(
            `${game.title} ${game.subtitle} ${url}`
          );
        } catch {
          /* clipboard unavailable */
        }
      }
    } catch {
      /* share cancelled */
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = () => {
    if (!videoUrl || !file) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="cg-modal-root" onClick={onClose}>
      <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎬 {s.replayExport}</h2>
        {phase === "ready" && (
          <>
            <p className="cg-empty-note">{s.replayExportDesc}</p>
            <p className="cg-empty-note">
              {s.replayMovesCount.replace("{n}", String(game.labels.length))}
            </p>
            <div className="cg-video-row">
              <span className="cg-video-label">{s.replaySpeed}</span>
              <div className="cg-seg" role="group" aria-label={s.replaySpeed}>
                {(
                  [
                    { v: 0.5, label: s.replaySpeedSlow },
                    { v: 1, label: s.replaySpeedNormal },
                    { v: 1.5, label: s.replaySpeedFast },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={speed === o.v ? "active" : ""}
                    onClick={() => setSpeed(o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="cg-video-mic">
              <input type="checkbox" checked={micOn} onChange={toggleMic} />
              <span>{s.replayMic}</span>
            </label>
            {micError && <p className="cg-error">{s.replayMicDenied}</p>}
            <div className="cg-modal-actions">
              <button
                type="button"
                className="cg-btn cg-btn-primary"
                onClick={startRecording}
              >
                ● {s.replayStart}
              </button>
              <button
                type="button"
                className="cg-btn small"
                onClick={onClose}
              >
                {s.replayClose}
              </button>
            </div>
          </>
        )}
        {phase === "recording" && (
          <>
            <p className="cg-empty-note">{s.replayRecording}</p>
            <div className="cg-progress">
              <div
                className="cg-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="cg-empty-note">{Math.round(progress * 100)}%</p>
            <div className="cg-modal-actions">
              <button
                type="button"
                className="cg-btn small"
                onClick={() => abortRef.current?.abort()}
              >
                {s.replayCancel}
              </button>
            </div>
          </>
        )}
        {phase === "done" && videoUrl && (
          <>
            <p className="cg-empty-note">{s.replayDone}</p>
            <video
              className="cg-video-preview"
              src={videoUrl}
              controls
              playsInline
            />
            <div className="cg-modal-actions">
              <button
                type="button"
                className="cg-btn cg-btn-primary"
                disabled={busy}
                onClick={shareFile}
              >
                📤 {s.replayShare}
              </button>
              <button
                type="button"
                className="cg-btn small"
                onClick={downloadFile}
              >
                ⬇️ {s.replayDownload}
              </button>
              <button type="button" className="cg-btn small" onClick={onClose}>
                {s.replayClose}
              </button>
            </div>
          </>
        )}
        {phase === "error" && (
          <>
            <p className="cg-error">{s.replayError}</p>
            <div className="cg-modal-actions">
              <button type="button" className="cg-btn small" onClick={onClose}>
                {s.replayClose}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
