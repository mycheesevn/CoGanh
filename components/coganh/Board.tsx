"use client";
import React from "react";
import { colOf, rowOf, NEIGHBORS, type Board as BoardState } from "@/lib/coganh/engine";

/* Geometry (family standard): viewBox 1080, grid points at 88 + k*226. */
const VB = 1080;
const P0 = 88;
const STEP = 226;
const px = (i: number) => P0 + colOf(i) * STEP;
const py = (i: number) => P0 + rowOf(i) * STEP;

/* Diagonal segments of the Alquerque web (deduplicated). */
const DIAGONALS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 25; i++) {
    for (const n of NEIGHBORS[i]) {
      if (n > i && colOf(n) !== colOf(i) && rowOf(n) !== rowOf(i)) out.push([i, n]);
    }
  }
  return out;
})();

export interface BoardProps {
  board: BoardState;
  selected: number | null;
  targets: number[];
  lastMove: { from: number; to: number } | null;
  flipped: number[];
  onPoint: (i: number) => void;
}

export default function Board({ board, selected, targets, lastMove, flipped, onPoint }: BoardProps) {
  const flipSet = new Set(flipped);
  return (
    <svg className="cg-board-svg" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Cờ Gánh board">
      {/* frame */}
      <rect x={6} y={6} width={VB - 12} height={VB - 12} rx={28} fill="#f6e7c1" stroke="#8a6d4a" strokeWidth={6} />
      <rect x={P0 - 52} y={P0 - 52} width={STEP * 4 + 104} height={STEP * 4 + 104} fill="none" stroke="#b98d54" strokeWidth={3} />

      {/* orthogonal grid */}
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={`h${k}`} x1={P0} y1={P0 + k * STEP} x2={P0 + 4 * STEP} y2={P0 + k * STEP} stroke="#5b4632" strokeWidth={5} />
      ))}
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={`v${k}`} x1={P0 + k * STEP} y1={P0} x2={P0 + k * STEP} y2={P0 + 4 * STEP} stroke="#5b4632" strokeWidth={5} />
      ))}
      {/* diagonals */}
      {DIAGONALS.map(([a, b]) => (
        <line key={`d${a}-${b}`} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} stroke="#c07f3e" strokeWidth={4} strokeDasharray="12 9" />
      ))}

      {/* coordinates: files A–E along the bottom, ranks 5–1 down the left */}
      {[0, 1, 2, 3, 4].map((c) => (
        <text key={`f${c}`} x={P0 + c * STEP} y={VB - 24} textAnchor="middle" fontSize={30} fill="#8a6d4a" fontWeight={600}>
          {"ABCDE"[c]}
        </text>
      ))}
      {[0, 1, 2, 3, 4].map((r) => (
        <text key={`r${r}`} x={26} y={P0 + r * STEP + 10} textAnchor="middle" fontSize={30} fill="#8a6d4a" fontWeight={600}>
          {5 - r}
        </text>
      ))}

      {/* last-move markers */}
      {lastMove && [lastMove.from, lastMove.to].map((p) => (
        <circle key={`lm${p}`} cx={px(p)} cy={py(p)} r={30} fill="none" stroke="#e8a33d" strokeWidth={7} opacity={0.9} />
      ))}

      {/* legal target dots */}
      {targets.map((t) => (
        <circle key={`t${t}`} cx={px(t)} cy={py(t)} r={26} fill="#3f9e4d" opacity={0.55} />
      ))}

      {/* pieces */}
      {board.map((cell, i) => {
        if (!cell) return null;
        const isRed = cell === "red";
        return (
          <g key={`p${i}`} className={flipSet.has(i) ? "cg-piece-flip" : undefined}>
            <circle cx={px(i)} cy={py(i)} r={39} fill={isRed ? "#b02a20" : "#1c4f8a"} />
            <circle cx={px(i)} cy={py(i)} r={34} fill={isRed ? "#cf3a30" : "#2569b8"} />
            <circle cx={px(i)} cy={py(i)} r={22} fill="none" stroke={isRed ? "#e88a80" : "#8ab6e8"} strokeWidth={4} />
            {selected === i && (
              <circle cx={px(i)} cy={py(i)} r={50} fill="none" stroke="#ffb52e" strokeWidth={8} />
            )}
          </g>
        );
      })}

      {/* click targets */}
      {Array.from({ length: 25 }, (_, i) => (
        <circle
          key={`c${i}`}
          cx={px(i)} cy={py(i)} r={104}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => onPoint(i)}
        />
      ))}
    </svg>
  );
}
