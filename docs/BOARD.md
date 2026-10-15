# Cờ Gánh — board spec (from the user's reference drawing, 2026-10-15)

Title on the drawing: "Trạng Thái Xếp Quân Ban Đầu - Bàn Cờ Gánh Việt Nam".

## Geometry
- 5×5 intersection points; cols 1–5 left→right, rows 1–5 top→bottom.
- Solid dark lines: the full orthogonal grid (every horizontal + vertical segment).
- Dashed orange lines: diagonals — exactly the Alquerque web: each unit
  square contains the single diagonal joining its two even-parity corners
  (diagonal moves exist only between points where col+row is even).
  Same board graph as Cờ Chiếu Tướng.
- Pieces are plain discs (red "DO" / blue "XANH") — no piece types.

## Initial position (verified by visual grounding count: 8 red + 8 blue)
- Red: row 1 all five (1,1)(2,1)(3,1)(4,1)(5,1) + row 2 (1,2)(3,2)(5,2).
- Blue: row 4 (1,4)(3,4)(5,4) + row 5 all five (1,5)(2,5)(3,5)(4,5)(5,5).
- Empty: all of row 3 + (2,2)(4,2)(2,4)(4,4) — 9 empty points.

Row-major string (R/B/.): `RRRRR` `R.R.R` `.....` `B.B.B` `BBBBB`
= "RRRRRR.R.R.....B.B.BBBBBB"
