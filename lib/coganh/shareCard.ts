"use client";
/**
 * Profile share card for Cờ Gánh — a 1080×1350 canvas PNG: app name,
 * the initial board with half-size discs, the player's headline and
 * stats line, and the site CTA. Mirrors the sibling games' card.
 */
import { initialBoard, colOf, rowOf, NEIGHBORS, type Board } from "./engine";

export interface ShareCardOpts {
  /** Board to draw; null = the initial position (profile/rank cards). */
  state: Board | null;
  headline: string;
  subline: string;
  appName: string;
  appUrl: string;
}

export function renderShareCard(opts: ShareCardOpts): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no 2d context"));

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#241a10");
    bg.addColorStop(1, "#14100c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f3e2bb";
    ctx.textAlign = "center";
    ctx.font = "700 64px system-ui, sans-serif";
    ctx.fillText(opts.appName, W / 2, 110);

    // Board: 760×760 centred, points at 60 + k*160 within the board box.
    const B = 760;
    const bx = (W - B) / 2;
    const by = 170;
    const P0 = 60;
    const STEP = 160;
    const px = (i: number) => bx + P0 + colOf(i) * STEP;
    const py = (i: number) => by + P0 + rowOf(i) * STEP;
    ctx.fillStyle = "#f6e7c1";
    ctx.strokeStyle = "#8a6d4a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(bx, by, B, B, 24);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#5b4632";
    ctx.lineWidth = 4;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(px(k * 5), py(k * 5));
      ctx.lineTo(px(k * 5 + 4), py(k * 5 + 4 - 4));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(k), py(k));
      ctx.lineTo(px(20 + k), py(20 + k));
      ctx.stroke();
    }
    // diagonals (dashed orange, the Alquerque web)
    ctx.strokeStyle = "#c07f3e";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    const drawn = new Set<string>();
    for (let i = 0; i < 25; i++) {
      for (const n of NEIGHBORS[i]) {
        if (colOf(n) === colOf(i) || rowOf(n) === rowOf(i)) continue;
        const key = [Math.min(i, n), Math.max(i, n)].join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);
        ctx.beginPath();
        ctx.moveTo(px(i), py(i));
        ctx.lineTo(px(n), py(n));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // pieces (the given position, or the initial one; half-size discs)
    const board = opts.state ?? initialBoard();
    board.forEach((cell, i) => {
      if (!cell) return;
      const red = cell === "red";
      ctx.fillStyle = red ? "#b02a20" : "#1c4f8a";
      ctx.beginPath();
      ctx.arc(px(i), py(i), 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = red ? "#cf3a30" : "#2569b8";
      ctx.beginPath();
      ctx.arc(px(i), py(i), 24, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 58px system-ui, sans-serif";
    ctx.fillText(opts.headline, W / 2, by + B + 110);
    ctx.fillStyle = "#d8c9a8";
    ctx.font = "400 40px system-ui, sans-serif";
    ctx.fillText(opts.subline, W / 2, by + B + 175);
    ctx.fillStyle = "#e8a33d";
    ctx.font = "600 38px system-ui, sans-serif";
    ctx.fillText(`👉 ${opts.appUrl}`, W / 2, H - 70);

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob failed"));
    }, "image/png");
  });
}

export async function sharePng(
  blob: Blob,
  title: string,
  text: string
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], "co-ganh-card.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title, text });
      return "shared";
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "co-ganh-card.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
