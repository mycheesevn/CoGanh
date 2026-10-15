"use client";
import React from "react";
import type { Color } from "@/lib/coganh/engine";
import { STR, type Lang } from "@/lib/coganh/i18n";

/** Position-editor tools (family standard, same shape as CCT/PacClone):
 *  move (lift & drop), erase, or place a disc of one colour. */
export type EditorTool =
  | { kind: "move" }
  | { kind: "erase" }
  | { kind: "place"; color: Color };

/** Apply one board tap under the active tool. Pure: returns the next
 *  cells + lifted index so both the setup editor and the puzzle create
 *  form share identical semantics (CCT SetupView onPoint):
 *  place stamps the colour (overwrites), erase clears, move lifts a
 *  piece then drops it on the tapped point (replacing any piece there);
 *  tapping the lifted point again cancels. */
export function editorTap(
  cells: (Color | null)[],
  i: number,
  tool: EditorTool,
  lifted: number | null
): { cells: (Color | null)[]; lifted: number | null } {
  if (tool.kind === "place") {
    const next = cells.slice();
    next[i] = tool.color;
    return { cells: next, lifted: null };
  }
  if (tool.kind === "erase") {
    const next = cells.slice();
    next[i] = null;
    return { cells: next, lifted: null };
  }
  if (lifted !== null) {
    if (lifted === i) return { cells, lifted: null };
    const next = cells.slice();
    next[i] = cells[lifted];
    next[lifted] = null;
    return { cells: next, lifted: null };
  }
  return { cells, lifted: cells[i] !== null ? i : null };
}

function DiscIcon({ color }: { color: Color }) {
  const isRed = color === "red";
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx={40} cy={40} r={36} fill={isRed ? "#b02a20" : "#1c4f8a"} />
      <circle cx={40} cy={40} r={31} fill={isRed ? "#cf3a30" : "#2569b8"} />
      <circle cx={40} cy={40} r={19} fill="none" stroke={isRed ? "#e88a80" : "#8ab6e8"} strokeWidth={4} />
    </svg>
  );
}

interface Props {
  lang: Lang;
  tool: EditorTool;
  onChange: (t: EditorTool) => void;
}

/** Tool rows + the per-tool hint line, rendered in the editor panel. */
export default function EditorTools({ lang, tool, onChange }: Props) {
  const s = STR[lang] as Record<string, string | string[]>;
  const hint =
    tool.kind === "move"
      ? s.setupHintMove
      : tool.kind === "erase"
        ? s.setupHintErase
        : s.setupHintPlace;
  return (
    <>
      <div className="cg-palette" role="group" aria-label={String(s.setupTools)}>
        <button
          type="button"
          className={`cg-palbtn cg-palbtn-tool${tool.kind === "move" ? " active" : ""}`}
          onClick={() => onChange({ kind: "move" })}
        >
          {String(s.setupMove)}
        </button>
        <button
          type="button"
          className={`cg-palbtn cg-palbtn-tool${tool.kind === "erase" ? " active" : ""}`}
          onClick={() => onChange({ kind: "erase" })}
        >
          {String(s.setupErase)}
        </button>
      </div>
      <div className="cg-palette" role="group" aria-label={String(s.setupPlace)}>
        {(["blue", "red"] as Color[]).map((color) => {
          const active = tool.kind === "place" && tool.color === color;
          return (
            <button
              key={color}
              type="button"
              className={`cg-palbtn${active ? " active" : ""}`}
              aria-label={`${String(s.setupPlace)} ${color === "blue" ? String(s.blueSide) : String(s.redSide)}`}
              onClick={() => onChange({ kind: "place", color })}
            >
              <DiscIcon color={color} />
            </button>
          );
        })}
      </div>
      <p className="cg-hint">{String(hint)}</p>
    </>
  );
}
