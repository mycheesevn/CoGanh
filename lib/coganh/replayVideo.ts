// Replay-to-video export for Cờ Gánh: re-render a game on canvas with
// move animations, capture it with canvas.captureStream +
// MediaRecorder, and return a video file. Fully client-side; Safari
// records MP4, Chrome records WebM. Standard timeline (boardgame-
// engagement skill, references/replay-video.md): intro card 2.0s with
// the site CTA → moves → decisive finish celebration 2.2s (final board
// full-bright + result banner + confetti, no card) → outro card 2.0s.

import { colOf, rowOf, gameStatus, NEIGHBORS, type Color } from "./engine";
import { buildReplayStates, type ReplayPly } from "./replay";
import { synthCapture, synthCheck, synthMove, synthMoveStart } from "./sound";
import { STR, type Lang } from "./i18n";

export interface CgReplayVideoInput {
  labels: string[];
  startPos?: string;
  startTurn?: Color;
  title: string;
  subtitle: string;
  lang: Lang;
  /** Playback speed multiplier (0.5 = half speed, slower). Defaults to 1. */
  speed?: number;
  micStream?: MediaStream | null;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

const VW = 720;
const VH = 960;
const STEP = 132;
const GRID = STEP * 4;
const P0 = (VW - GRID) / 2; // 96
const BY = 190;

// Disc radii as fractions of STEP — must match the live board geometry
// (rim 39 / main 34 on a 226 step) so videos show the real piece size.
const RIM_R = STEP * (39 / 226);
const DISC_R = STEP * (34 / 226);

const TITLE_DUR = 2.0;
const FINISH_DUR = 2.2;
const END_DUR = 2.0;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x, y, r);
  ctx.closePath();
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const cands = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
  for (const c of cands) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* ignore */ }
  }
  return "";
}

/* Unique diagonal segments (the Alquerque web), drawn dashed orange. */
const DIAGONALS: Array<[number, number]> = (() => {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 25; i++) {
    for (const n of NEIGHBORS[i]) {
      if (colOf(n) === colOf(i) || rowOf(n) === rowOf(i)) continue;
      const key = [Math.min(i, n), Math.max(i, n)].join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, n]);
    }
  }
  return out;
})();

/** Render the game replay to a video file. Rejects on cancel or unsupported. */
export async function exportCgReplayVideo(
  input: CgReplayVideoInput
): Promise<File> {
  const { labels, lang, onProgress, signal } = input;
  const s = STR[lang] as unknown as Record<string, string>;
  const mime = pickMime();
  const canvas = document.createElement("canvas");
  if (!mime || typeof canvas.captureStream !== "function") {
    throw new Error("unsupported");
  }
  canvas.width = VW;
  canvas.height = VH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unsupported");

  const cx = (i: number): number => P0 + colOf(i) * STEP;
  const cy = (i: number): number => BY + rowOf(i) * STEP;

  const startTurn: Color = input.startTurn ?? "blue";
  const { states, plies } = buildReplayStates({
    labels,
    startPos: input.startPos,
    startTurn,
    title: "",
    subtitle: "",
  });
  const n = plies.length;
  const finalTurn: Color = (n + (startTurn === "red" ? 1 : 0)) % 2 === 0 ? "blue" : "red";
  const finalStatus = gameStatus(states[n], finalTurn);
  const winner: Color | null = finalStatus.over ? finalStatus.winner : null;
  const decisive = winner !== null && n > 0 && plies[n - 1].decisive;
  const bannerText = winner === "blue" ? s.blueWins : winner === "red" ? s.redWins : null;

  const speed =
    input.speed && input.speed > 0 ? Math.min(2, Math.max(0.25, input.speed)) : 1;
  const GLIDE = 0.6 / speed;
  const HOLD = 1.0 / speed;
  const PER = GLIDE + HOLD;
  const finishDur = decisive ? FINISH_DUR : 0;
  const total = TITLE_DUR + n * PER + finishDur + END_DUR;

  // Deterministic confetti bursts on a decisive finish.
  const CONFETTI_COLORS = ["#e2483d", "#4d8fd1", "#f5c542", "#ffffff", "#ffd97a"];
  interface ConfettiP {
    bx: number; by: number; vx: number; vy: number;
    w: number; h: number; rot: number; vr: number;
    color: string; delay: number;
  }
  const confettiBursts: Array<{ t0: number; parts: ConfettiP[] }> = [];
  if (decisive) {
    let seed = 987654321;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const mateT = TITLE_DUR + (n - 1) * PER + GLIDE;
    const endT = TITLE_DUR + n * PER;
    const mkBurst = (t0: number, cxp: number) => {
      const parts: ConfettiP[] = [];
      for (let i = 0; i < 70; i++) {
        parts.push({
          bx: cxp + (rnd() - 0.5) * 60,
          by: 300 + rnd() * 80,
          vx: (rnd() - 0.5) * 260,
          vy: -(240 + rnd() * 320),
          w: 7 + rnd() * 7,
          h: 4 + rnd() * 5,
          rot: rnd() * Math.PI,
          vr: (rnd() - 0.5) * 9,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delay: rnd() * 0.25,
        });
      }
      confettiBursts.push({ t0, parts });
    };
    mkBurst(mateT, VW / 2);
    mkBurst(mateT + 0.55, VW * 0.3);
    mkBurst(mateT + 0.55, VW * 0.7);
    mkBurst(endT + 0.1, VW / 2);
  }
  const drawConfetti = (t: number) => {
    for (const b of confettiBursts) {
      const age = t - b.t0;
      if (age < 0) continue;
      for (const p of b.parts) {
        const a = age - p.delay;
        if (a < 0 || a > 2.6) continue;
        const x = p.bx + p.vx * a;
        const y = p.by + p.vy * a + 340 * a * a;
        if (y > VH + 30) continue;
        ctx.save();
        ctx.globalAlpha = a > 2.0 ? Math.max(0, (2.6 - a) / 0.6) : 1;
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.vr * a);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.sin(a * 6 + p.rot))));
        ctx.restore();
      }
    }
  };

  const drawDisc = (x: number, y: number, color: Color, scale: number) => {
    const rimR = RIM_R * scale;
    const r = DISC_R * scale;
    const red = color === "red";
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.arc(x, y + rimR * 0.09, rimR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = red ? "#8e231b" : "#173f68";
    ctx.beginPath();
    ctx.arc(x, y, rimR, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
    if (red) {
      g.addColorStop(0, "#e05248");
      g.addColorStop(1, "#b02a20");
    } else {
      g.addColorStop(0, "#3f83cc");
      g.addColorStop(1, "#1d5aa8");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = r * (3 / 34);
    ctx.beginPath();
    ctx.arc(x, y, r * (22 / 34), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  const drawBoard = (lastMove: { from: number; to: number } | null) => {
    const pm = 56;
    const panel = ctx.createLinearGradient(0, BY, 0, BY + GRID);
    panel.addColorStop(0, "#f6e7c1");
    panel.addColorStop(1, "#ecd9ac");
    ctx.fillStyle = panel;
    rr(ctx, P0 - pm, BY - pm, GRID + pm * 2, GRID + pm * 2, 26);
    ctx.fill();
    ctx.strokeStyle = "#8a6d4a";
    ctx.lineWidth = 4;
    rr(ctx, P0 - pm, BY - pm, GRID + pm * 2, GRID + pm * 2, 26);
    ctx.stroke();
    ctx.strokeStyle = "#5b4632";
    ctx.lineWidth = 4;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(P0, BY + k * STEP);
      ctx.lineTo(P0 + GRID, BY + k * STEP);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(P0 + k * STEP, BY);
      ctx.lineTo(P0 + k * STEP, BY + GRID);
      ctx.stroke();
    }
    ctx.save();
    ctx.strokeStyle = "#c07f3e";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    for (const [a, b] of DIAGONALS) {
      ctx.beginPath();
      ctx.moveTo(cx(a), cy(a));
      ctx.lineTo(cx(b), cy(b));
      ctx.stroke();
    }
    ctx.restore();
    if (lastMove) {
      ctx.fillStyle = "rgba(255, 213, 59, 0.38)";
      for (const i of [lastMove.from, lastMove.to]) {
        ctx.beginPath();
        ctx.arc(cx(i), cy(i), RIM_R * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const drawPieces = (
    board: Array<Color | null>,
    skip: number[],
    movers: Array<{ color: Color; x: number; y: number; scale: number }>,
    flipRing: { cells: number[]; alpha: number } | null
  ) => {
    for (let i = 0; i < 25; i++) {
      if (skip.includes(i)) continue;
      const cell = board[i];
      if (!cell) continue;
      drawDisc(cx(i), cy(i), cell, 1);
    }
    if (flipRing) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 190, 40, ${flipRing.alpha})`;
      ctx.lineWidth = 4;
      for (const i of flipRing.cells) {
        ctx.beginPath();
        ctx.arc(cx(i), cy(i), RIM_R * 1.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const mv of movers) drawDisc(mv.x, mv.y, mv.color, mv.scale);
  };

  const drawFrame = (t: number) => {
    const bg = ctx.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, "#241a10");
    bg.addColorStop(1, "#14100c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.strokeStyle = "#e0a32e";
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, VW - 28, VH - 28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let board = states[0];
    let caption: string | null = null;
    let anim: { ply: ReplayPly; idx: number; p: number; color: Color } | null = null;
    let lastMove: { from: number; to: number } | null = null;
    let trailRemnant: { move: { from: number; to: number }; q: number } | null = null;
    let flipRing: { cells: number[]; alpha: number } | null = null;
    let card = false;
    let showBanner = false;

    if (t < TITLE_DUR) {
      card = true;
    } else {
      const mt = t - TITLE_DUR;
      const idx = Math.floor(mt / PER);
      if (idx >= n) {
        board = states[n];
        if (n > 0) {
          lastMove = { from: plies[n - 1].move.from, to: plies[n - 1].move.to };
          if (plies[n - 1].flips.length > 0) {
            flipRing = { cells: plies[n - 1].flips, alpha: 0.8 };
          }
        }
        if (decisive && mt < n * PER + FINISH_DUR) {
          showBanner = true;
        } else {
          card = true;
        }
      } else {
        const lt = mt - idx * PER;
        const ply = plies[idx];
        const m = ply.move;
        board = states[idx];
        const cell = board[m.from];
        if (lt < GLIDE && cell) {
          anim = { ply, idx, p: easeInOut(lt / GLIDE), color: cell };
        } else {
          board = states[idx + 1];
          lastMove = { from: m.from, to: m.to };
          const holdT = lt - GLIDE;
          if (holdT < 0.45) trailRemnant = { move: lastMove, q: 1 - holdT / 0.45 };
          if (ply.flips.length > 0) {
            flipRing = { cells: ply.flips, alpha: Math.max(0, 0.9 - holdT * 0.8) };
          }
        }
        caption = `${idx + 1}/${n} · ${ply.label}`;
        if (ply.decisive) showBanner = true;
      }
    }

    // Header.
    ctx.fillStyle = "#e8c96a";
    ctx.font = "700 44px Georgia, serif";
    ctx.fillText(lang === "vi" ? "CỜ GÁNH" : "CO GANH", VW / 2, 64);
    if (!card) {
      ctx.fillStyle = "#e8e2d2";
      ctx.font = "400 27px system-ui, sans-serif";
      ctx.fillText(input.title, VW / 2, 116, VW - 80);
    }

    drawBoard(lastMove);

    if (anim) {
      const { ply, p, color } = anim;
      const m = ply.move;
      const fade = p < 0.75 ? 1 : (1 - p) / 0.25;
      const x0 = cx(m.from);
      const y0 = cy(m.from);
      const x1 = cx(m.to);
      const y1 = cy(m.to);
      ctx.save();
      ctx.strokeStyle = "#40e0d0";
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.85 * fade;
      ctx.lineWidth = 5 + 11 * fade;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * (1 - p);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x0, y0, RIM_R * (0.5 + 0.38 * p), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p;
      ctx.save();
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = "#40e0d0";
      ctx.beginPath();
      ctx.arc(x, y, RIM_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawPieces(board, [m.from], [{ color, x, y, scale: 1.07 }], null);
    } else {
      if (trailRemnant) {
        const m = trailRemnant.move;
        ctx.save();
        ctx.strokeStyle = "#40e0d0";
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.7 * trailRemnant.q;
        ctx.lineWidth = 5 + 9 * trailRemnant.q;
        ctx.beginPath();
        ctx.moveTo(cx(m.from), cy(m.from));
        ctx.lineTo(cx(m.to), cy(m.to));
        ctx.stroke();
        ctx.restore();
      }
      drawPieces(board, [], [], flipRing);
    }

    if (caption && !card) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 30px system-ui, sans-serif";
      ctx.fillText(caption, VW / 2, 880, VW - 80);
    }

    if (showBanner && bannerText) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      const bw = VW - 160;
      const bh = 110;
      const bx = (VW - bw) / 2;
      const by = VH / 2 - bh / 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = "#ffd43b";
      ctx.lineWidth = 4;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = "#ffd43b";
      ctx.font = "700 54px Georgia, serif";
      ctx.fillText(`🏆 ${bannerText}`, VW / 2, VH / 2, bw - 40);
      ctx.restore();
    }

    if (card) {
      ctx.fillStyle = "rgba(8, 10, 14, 0.66)";
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = "#e8c96a";
      ctx.font = "700 62px Georgia, serif";
      ctx.fillText(lang === "vi" ? "CỜ GÁNH" : "CO GANH", VW / 2, VH / 2 - 118);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 42px system-ui, sans-serif";
      ctx.fillText(input.title, VW / 2, VH / 2 - 28, VW - 80);
      ctx.fillStyle = "#cfd8e3";
      ctx.font = "400 33px system-ui, sans-serif";
      ctx.fillText(input.subtitle, VW / 2, VH / 2 + 38, VW - 80);
      ctx.fillStyle = "#e8c96a";
      ctx.font = "600 26px system-ui, sans-serif";
      ctx.fillText(s.replaySiteCta, VW / 2, VH / 2 + 104, VW - 60);
    }

    drawConfetti(t);
  };

  const stream = canvas.captureStream(30);

  // Synthesized soundtrack on the video timeline.
  let actx: AudioContext | null = null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = new AC();
    if (actx.state === "suspended") await actx.resume();
    const dest = actx.createMediaStreamDestination();
    const track = dest.stream.getAudioTracks()[0];
    if (track) stream.addTrack(track);
    if (input.micStream) {
      try {
        actx.createMediaStreamSource(input.micStream).connect(dest);
      } catch { /* ignore */ }
    }
    const base = actx.currentTime + 0.15;
    plies.forEach((ply, i) => {
      const t0 = base + TITLE_DUR + i * PER;
      if (ply.flips.length > 0) synthCapture(dest, t0 + GLIDE);
      synthMoveStart(dest, t0);
      synthMove(dest, t0 + GLIDE);
      if (ply.decisive) synthCheck(dest, t0 + GLIDE + 0.1);
    });
  } catch {
    actx = null;
  }

  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_500_000,
  });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    rec.onerror = () => reject(new Error("record_failed"));
  });

  let raf = 0;
  let lastPct = -1;
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
  };
  signal?.addEventListener("abort", onAbort);

  try {
    rec.start(250);
    const t0 = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (cancelled || signal?.aborted) {
          reject(new Error("cancelled"));
          return;
        }
        const t = (performance.now() - t0) / 1000;
        if (t >= total) {
          drawFrame(total);
          resolve();
          return;
        }
        drawFrame(t);
        const pct = Math.floor((t / total) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct / 100);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    cancelAnimationFrame(raf);
    signal?.removeEventListener("abort", onAbort);
    if (rec.state !== "inactive") rec.stop();
    if (actx) {
      try {
        await actx.close();
      } catch { /* ignore */ }
    }
  }

  const blob = await finished;
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `co-ganh-replay.${ext}`, { type: mime });
}
