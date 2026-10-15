# Cờ Gánh — rules as explained by the user (2026-10-15), CONFIRMED FINAL

## Pieces
- 16 identical discs (8 red, 8 blue). No king, no ranks — every piece
  moves and captures identically. Strength is purely positional
  (points where orthogonal + diagonal lines cross are strongest).

## Turn order
- **BLUE (Xanh) moves first.** (Drawing: Red on top rows 1–2, Blue at
  the bottom rows 4–5.)

## Movement
- On your turn, move ONE of your pieces along a drawn line (orthogonal
  or diagonal) to an adjacent EMPTY point. No jumping, one move/turn.

## Gánh (active capture)
- When your piece MOVES INTO the point exactly between two enemy
  pieces — three consecutive points in a straight line (horizontal,
  vertical, or diagonal): Enemy–You–Enemy — BOTH enemy pieces flip to
  your color. Pieces further along the same line are unaffected.
- **Multi-axis confirmed**: one landing resolves gánh on EVERY axis
  through the destination simultaneously ("Gánh đa trục" — kép/ba/bốn
  by the number of axes that flip a pair).

## Chẹt (surround capture)
- Checked immediately after each move, and it applies ONLY to the
  mover's OPPONENT: enemy groups that the move has just left with no
  way to move.
- A "group" = same-color pieces connected continuously along drawn
  lines (orthogonal AND diagonal connections count).
- A group is chẹt when it has NO empty point adjacent (along drawn
  lines) to any of its members; the WHOLE group flips to the mover's
  color at once. The canonical completion: the move fills the group's
  last remaining "breathing point".
- **Self-surround is SAFE**: moving your own piece/group into a
  no-empty-neighbour position never flips your own pieces (the
  "pháo đài cố thủ" / solid-block defensive tactic). Only the
  opponent's action (gánh or completing a chẹt) can flip your pieces.

## Luật Mở (forced capture)
- ENFORCED: if the player to move has any gánh move available, they
  MUST play a gánh move (no quiet move allowed instead).
- Free choice: with several gánh moves available (one piece with
  several gánh targets, or several "ép gánh" spots opened by the
  opponent), the player picks ANY ONE of them — never forced to take
  the biggest capture. Unchosen forced spots simply lapse for that
  turn.

## Game end
- A player LOSES immediately when:
  1. All their pieces have been flipped (zero pieces left), or
  2. They still have pieces but NO legal move on their turn, or
  3. They resign.
- DRAW: no traditional draw rule; only by mutual agreement
  (infinite repetition with very few pieces, or both sides agree the
  position is deadlocked). Draws are rare. (Vs-computer follows the
  family house rule: no draw adjudication; the engine steers away
  from repetition.)

## Resolution order (implementation reading, from the rules above)
1. Move the piece (origin becomes empty).
2. Gánh: flip the enemy pair on every axis through the destination
   where both neighbours are enemy.
3. Chẹt: on the resulting board, every enemy group that touches the
   destination point and now has zero empty adjacent points flips in
   full. (Groups the move did not affect — e.g. a pre-existing
   self-locked enemy fortress whose last liberty this move did not
   take — are NOT flipped: chẹt only completes on the move that takes
   the group's last breathing point.)

## Opening note (strategy, not a rule)
- Rushing a corner piece into the middle row too early, without
  support, lets the opponent step into the vacated gap and counter-
  gánh ("gánh ngược"), collapsing the opening structure.
