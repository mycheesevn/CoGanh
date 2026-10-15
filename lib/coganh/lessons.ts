/**
 * Cờ Gánh — Bí Kíp (interactive lesson library).
 *
 * Every line is machine-verified with the engine before shipping
 * (scripts/verify-lessons.mjs): all moves legal in sequence under the
 * full rules (including Luật Mở forced gánh), and claimed flip counts
 * really happen. Lesson ids are prefixed "cg-" — the shared
 * `library_progress` table holds rows for all games.
 *
 * Moves use the engine's label format ("B2→B3", see notation.ts).
 * Positions are 25-char board strings ('B' blue, 'R' red, '.' empty),
 * index = row * 5 + col with row 0 at the TOP (rank 5).
 */

export interface LText {
  vi: string;
  en: string;
}

export interface LessonStep {
  /** Engine move label, e.g. "B2→B3". */
  move: string;
  /** "show" = auto-played with explanation; "quiz" = the user must find and play this exact move. */
  kind: "show" | "quiz";
  /** Explanation (for quiz steps: the "correct!" text shown after playing it). */
  text: LText;
  /** Shown when it's the user's turn on a quiz step. */
  quizPrompt?: LText;
  /** Pieces this move must flip (asserted by the verifier). */
  expectFlips?: number;
}

export interface Lesson {
  id: string;
  title: LText;
  intro: LText;
  startPos: string;
  startTurn: "blue" | "red";
  steps: LessonStep[];
  outro: LText;
}

export interface Chapter {
  id: string;
  icon: string;
  title: LText;
  subtitle: LText;
  lessons: Lesson[];
}

/** Build a 25-char position from {index: 'B'|'R'} placements. */
function pos(pieces: Record<number, "B" | "R">): string {
  const cells = Array(25).fill(".");
  for (const [k, v] of Object.entries(pieces)) cells[Number(k)] = v;
  return cells.join("");
}

export const LESSONS: Chapter[] = [
  {
    id: "cg-ch1",
    icon: "🥪",
    title: { vi: "Gánh — nước đi làm nên Cờ Gánh", en: "Ganh — the move that defines the game" },
    subtitle: { vi: "Lật đôi, gánh đa trục và Luật Mở", en: "Sandwich flips, multi-axis ganh and the Open Rule" },
    lessons: [
      {
        id: "cg-l1",
        title: { vi: "Nước gánh đầu tiên", en: "Your first ganh" },
        intro: {
          vi: "Đi vào GIỮA hai quân địch trên cùng một đường thẳng — cả hai quân địch lật thành quân của ta. Đó là nước gánh.",
          en: "Step INTO the middle of two enemy pieces on one straight line — both flip to your color. That is a ganh.",
        },
        // Reds at A3 (10) and C3 (12); blue at B2 (16) steps up to B3 (11).
        startPos: pos({ 4: "R", 10: "R", 12: "R", 16: "B", 22: "B", 24: "R" }),
        startTurn: "blue",
        steps: [
          {
            move: "B2→B3",
            kind: "quiz",
            expectFlips: 2,
            quizPrompt: {
              vi: "Hai quân đỏ đang chờ trên hàng 3. Hãy đi vào giữa chúng!",
              en: "Two red pieces wait on rank 3. Step between them!",
            },
            text: {
              vi: "Gánh! Hai quân đỏ ở hai đầu bị kẹp và lật thành xanh trong một nước.",
              en: "Ganh! The two red pieces on the ends are sandwiched and flip to blue in one move.",
            },
          },
          {
            move: "E5→D5",
            kind: "show",
            text: {
              vi: "Đỏ rút quân về phòng thủ. Chú ý: quân vừa lật xong đổi màu vĩnh viễn — không có khái niệm 'ăn' rồi bỏ bàn như cờ ăn quân.",
              en: "Red retreats to defend. Note: flipped pieces change color for good — nothing is ever removed from the board.",
            },
          },
        ],
        outro: {
          vi: "Gánh lật ĐÚNG hai quân kẹp hai đầu trên MỖI trục qua điểm đến. Trục nào không đủ cặp địch thì không lật.",
          en: "A ganh flips EXACTLY the two pieces sandwiching the landing point on EACH axis through it. An axis without an enemy pair flips nothing.",
        },
      },
      {
        id: "cg-l2",
        title: { vi: "Gánh đa trục — một nước lật bốn", en: "Multi-axis ganh — four flips in one move" },
        intro: {
          vi: "Điểm đến nằm ở giao của nhiều đường. Mọi trục qua điểm đến đều xét gánh cùng lúc — một nước có thể lật 2, 4, 6, thậm chí 8 quân.",
          en: "The landing point sits at a crossing of lines. Every axis through it resolves at once — one move can flip 2, 4, 6, even 8 pieces.",
        },
        // Reds flank the center on both axes: B3/D3 (11/13), C4/C2 (7/17).
        // Blue at B4 (6) dives diagonally into C3 (12).
        startPos: pos({ 0: "R", 6: "B", 7: "R", 11: "R", 13: "R", 17: "R", 20: "B", 24: "R" }),
        startTurn: "blue",
        steps: [
          {
            move: "B4→C3",
            kind: "quiz",
            expectFlips: 4,
            quizPrompt: {
              vi: "Ô trung tâm đang bị bốn quân đỏ vây bốn phía. Lao vào giữa!",
              en: "Four red pieces flank the center square. Dive into the middle!",
            },
            text: {
              vi: "Gánh đôi trục! Trục ngang lật B3+D3, trục dọc lật C4+C2 — bốn quân đổi màu trong một nước đi. Và quân ta đứng giữa vòng vây vẫn an toàn: luật chỉ lật quân ĐỐI PHƯƠNG, tự vây mình không bao giờ bị lật.",
              en: "Double-axis ganh! The horizontal axis flips B3+D3, the vertical flips C4+C2 — four pieces change color in one move. And your piece stands safely inside the ring: the rules only ever flip the OPPONENT's pieces, never your own for surrounding yourself.",
            },
          },
        ],
        outro: {
          vi: "Khi chọn điểm đến, hãy nhìn cả bốn trục: ngang, dọc và hai đường chéo (chỉ tại các điểm có vẽ chéo).",
          en: "When picking a landing point, check all four axes: horizontal, vertical and both diagonals (only at points where diagonals are drawn).",
        },
      },
      {
        id: "cg-l3",
        title: { vi: "Luật Mở — thấy gánh là phải gánh", en: "The Open Rule — a ganh must be taken" },
        intro: {
          vi: "Luật quan trọng nhất của Cờ Gánh: nếu có nước gánh, bạn BẮT BUỘC phải gánh — không được đi nước thường. Có nhiều nước gánh thì được chọn một trong số đó.",
          en: "The most important rule of Co Ganh: if a ganh is available you MUST take it — quiet moves are illegal. With several ganh moves, you choose one.",
        },
        // Blue at B2 (16) can ganh into B3 (11) over A3/C3. Blue also has
        // a piece at A1 (20) that would love to advance — not allowed.
        // Red moves first (a quiet move — red has no ganh here).
        startPos: pos({ 2: "R", 10: "R", 12: "R", 16: "B", 20: "B", 24: "R" }),
        startTurn: "red",
        steps: [
          {
            move: "C5→C4",
            kind: "show",
            text: {
              vi: "Đỏ vừa tiến quân. Giờ đến lượt xanh: quân A1 rất muốn tiến lên, nhưng bàn cờ đang có một nước gánh…",
              en: "Red just advanced. Now blue to move: the A1 piece wants to march up, but a ganh exists on the board…",
            },
          },
          {
            move: "B2→B3",
            kind: "quiz",
            expectFlips: 2,
            quizPrompt: {
              vi: "Theo Luật Mở, nước đi thường bị cấm. Tìm nước gánh bắt buộc!",
              en: "Under the Open Rule, quiet moves are forbidden. Find the forced ganh!",
            },
            text: {
              vi: "Đúng luật! Khi có gánh, mọi nước thường đều không hợp lệ. Đây cũng là nền tảng của các bẫy 'dâng quân' ở bài sau.",
              en: "Correct! While a ganh exists, every quiet move is illegal. This is also the foundation of the bait traps you will meet later.",
            },
          },
        ],
        outro: {
          vi: "Hãy luôn quét bàn cờ tìm nước gánh TRƯỚC khi nghĩ đến nước thường — cho cả mình và đối thủ.",
          en: "Always scan for ganh moves FIRST — for yourself and for your opponent — before considering quiet moves.",
        },
      },
    ],
  },
  {
    id: "cg-ch2",
    icon: "🕸️",
    title: { vi: "Chẹt — vây kín là đổi màu", en: "Chet — surround a group and it flips" },
    subtitle: { vi: "Vây một quân, vây cả nhóm, và combo gánh + chẹt", en: "Trap one piece, trap a whole group, and the ganh + chet combo" },
    lessons: [
      {
        id: "cg-l4",
        title: { vi: "Chẹt một quân ở góc", en: "Trapping a single piece in the corner" },
        intro: {
          vi: "Một quân (hoặc nhóm quân) địch không còn bất kỳ ô trống kề nào sẽ bị lật toàn bộ. Góc bàn là nơi dễ chẹt nhất vì quân ở góc chỉ có 3 ô kề.",
          en: "An enemy piece (or group) with no empty neighboring point left flips entirely. Corners trap easiest — a corner piece has only 3 neighbors.",
        },
        // Red at A5 (0); blue already holds B5 (1) and A4 (5). Blue at
        // C4 (7) steps to B4 (6) — the last liberty.
        startPos: pos({ 0: "R", 1: "B", 4: "R", 5: "B", 7: "B", 20: "B", 24: "R" }),
        startTurn: "blue",
        steps: [
          {
            move: "C4→B4",
            kind: "quiz",
            expectFlips: 1,
            quizPrompt: {
              vi: "Quân đỏ ở góc A5 chỉ còn một ô thở cuối cùng. Bịt nó lại!",
              en: "The red piece on A5 has one last breathing point. Seal it!",
            },
            text: {
              vi: "Chẹt! Ô B4 là ô trống kề cuối cùng của quân đỏ ở góc — mất nó, quân đỏ lật thành xanh dù không ai 'ăn' trực tiếp.",
              en: "Chet! B4 was the corner piece's last empty neighbor — losing it, the red piece flips to blue without being captured directly.",
            },
          },
        ],
        outro: {
          vi: "Chẹt chỉ xét quân ĐỐI PHƯƠNG và chỉ khi nước đi của bạn chạm tới nhóm đó — một 'pháo đài' địch tự khóa từ trước sẽ không tự lật vì một nước đi xa không liên quan.",
          en: "Chet only ever hits the OPPONENT, and only when your move touches that group — an enemy fortress locked long ago does not flip because of an unrelated move far away.",
        },
      },
      {
        id: "cg-l5",
        title: { vi: "Chẹt tính theo NHÓM liên thông", en: "Chet counts the whole connected group" },
        intro: {
          vi: "Đừng đếm ô thở của từng quân — hãy đếm ô thở của cả NHÓM quân liên thông. Một quân bị vây kín nhưng nối với đồng đội còn ô thở thì vẫn sống.",
          en: "Do not count liberties per piece — count them for the whole connected GROUP. A piece that looks trapped survives if its group still breathes somewhere.",
        },
        // Blue at C3 (12) is ringed by reds at C4/D3/C2 (7/13/17) but
        // connects to blue B3 (11), whose liberty A3 (10) stays open.
        // (Spare blue sits at C1 (22): corner spares would hand red an
        // accidental diagonal ganh — the verifier guards this.)
        startPos: pos({ 2: "R", 7: "R", 11: "B", 12: "B", 13: "R", 17: "R", 22: "B", 24: "R" }),
        startTurn: "red",
        steps: [
          {
            move: "D3→D4",
            kind: "show",
            text: {
              vi: "Đỏ vừa bịt thêm một ô quanh quân xanh ở C3. Trông như sắp chẹt — nhưng quân xanh KHÔNG lật: nó nối với quân B3, và nhóm {B3, C3} vẫn còn nhiều ô thở!",
              en: "Red sealed another point around the blue piece on C3. It looks like a trap — but blue does NOT flip: it connects to B3, and the group {B3, C3} still has plenty of liberties!",
            },
          },
          {
            move: "B3→A3",
            kind: "quiz",
            expectFlips: 0,
            quizPrompt: {
              vi: "Mở rộng nhóm ra ô thở trước khi đỏ bịt nốt. Đi nước thoát!",
              en: "Extend the group onto its liberty before red seals it. Play the escape!",
            },
            text: {
              vi: "Tốt! Nhóm xanh giờ có thêm nhiều ô thở mới. Ngược lại, khi muốn chẹt địch, hãy chắc chắn bạn bịt được ô thở CUỐI CÙNG của cả nhóm.",
              en: "Good! The blue group now has fresh liberties. Conversely, when you hunt a group, make sure you take its group's LAST liberty.",
            },
          },
        ],
        outro: {
          vi: "Nhóm càng lớn, một nước chẹt ăn càng nhiều quân — nhưng cũng cần bịt càng nhiều ô. Hãy rình nhóm địch khi chúng chỉ còn một ô thở.",
          en: "The bigger the group, the more pieces one chet wins — but the more points you must seal. Lurk until the enemy group is down to its last liberty.",
        },
      },
      {
        id: "cg-l6",
        title: { vi: "Combo: gánh kéo theo chẹt", en: "Combo: a ganh that drags a chet along" },
        intro: {
          vi: "Thứ tự giải quyết sau mỗi nước: gánh trước, chẹt sau — trong CÙNG một nước đi. Một nước gánh đúng chỗ có thể vừa lật đôi, vừa bịt ô thở cuối của một nhóm khác.",
          en: "Resolution order after every move: ganh first, then chet — within the SAME move. A well-placed ganh can flip a pair and seal a group's last liberty at once.",
        },
        // Blue wall at A5/B5/C5/A4/C4 (0/1/2/5/7) around red B4 (6), whose
        // only remaining liberties are the ganh pair A3/C3 (10/12) and the
        // landing point B3 (11). Blue at B2 (16) dives in.
        startPos: pos({ 0: "B", 1: "B", 2: "B", 5: "B", 6: "R", 7: "B", 10: "R", 12: "R", 16: "B", 20: "B", 24: "R" }),
        startTurn: "blue",
        steps: [
          {
            move: "B2→B3",
            kind: "quiz",
            expectFlips: 3,
            quizPrompt: {
              vi: "Một nước đi, ba quân đổi màu. Tìm điểm đến kỳ diệu!",
              en: "One move, three pieces change color. Find the magic landing point!",
            },
            text: {
              vi: "Combo hoàn hảo! Gánh lật A3+C3, và vì cả ba ô quanh quân đỏ B4 giờ đều là xanh, chẹt lật nốt B4 — ba quân trong một nước.",
              en: "Perfect combo! The ganh flips A3+C3, and with every point around the red B4 piece now blue, chet flips B4 too — three pieces in a single move.",
            },
          },
        ],
        outro: {
          vi: "Khi một nhóm địch sắp hết ô thở, hãy tự hỏi: có nước gánh nào vừa lật vừa bịt nốt ô cuối không? Đó là những nước đi đẹp nhất của Cờ Gánh.",
          en: "When an enemy group is nearly out of air, ask: is there a ganh that also seals its last point? Those are the most beautiful moves in Co Ganh.",
        },
      },
    ],
  },
];

export const ALL_LESSONS: Lesson[] = LESSONS.flatMap((c) => c.lessons);
