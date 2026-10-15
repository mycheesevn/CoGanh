/** Cờ Gánh UI strings — Vietnamese default, English supported (family pattern). */

export type Lang = "vi" | "en";

const vi = {
  appName: "Cờ Gánh",
  tagline: "Trò chơi dân gian Việt Nam",
  playVsComputer: "Chơi với máy",
  howTo: "Cách chơi",
  settings: "Cài đặt",
  sound: "Âm thanh",
  language: "Ngôn ngữ",
  level: "Cấp độ máy",
  newGame: "Ván mới",
  undo: "Đi lại",
  resign: "Xin thua",
  resignConfirm: "Chắc chắn xin thua ván này?",
  yes: "Đúng vậy",
  cancel: "Hủy",
  blue: "Xanh",
  red: "Đỏ",
  you: "Bạn",
  computer: "Máy",
  yourTurn: "Đến lượt bạn (Xanh)",
  computerTurn: "Máy đang nghĩ…",
  forcedGanh: "Có nước Gánh — bắt buộc phải Gánh!",
  bluePieces: "Quân Xanh",
  redPieces: "Quân Đỏ",
  moveList: "Lịch sử nước đi",
  noMovesYet: "Chưa có nước đi nào.",
  youWin: "Bạn thắng! 🎉",
  youLose: "Máy thắng!",
  winFlippedAll: "Bạn đã lật toàn bộ quân Đỏ.",
  loseFlippedAll: "Máy đã lật toàn bộ quân Xanh của bạn.",
  winNoMoves: "Đỏ không còn nước đi hợp lệ.",
  loseNoMoves: "Bạn không còn nước đi hợp lệ.",
  resigned: "Bạn đã xin thua.",
  ganh: "Gánh",
  chet: "Chẹt",
  startHint: "Bạn cầm quân Xanh (dưới), đi trước. Chạm vào một quân để xem các nước đi.",
  footer: "© SynerWork Inc. — Cờ Gánh, trò chơi dân gian Việt Nam.",
  privacy: "Riêng tư",
  terms: "Điều khoản",
};

export type Strings = typeof vi;

const en: Strings = {
  appName: "Co Ganh",
  tagline: "Vietnamese folk board game",
  playVsComputer: "Play vs computer",
  howTo: "How to play",
  settings: "Settings",
  sound: "Sound",
  language: "Language",
  level: "Computer level",
  newGame: "New game",
  undo: "Undo",
  resign: "Resign",
  resignConfirm: "Resign this game?",
  yes: "Yes",
  cancel: "Cancel",
  blue: "Blue",
  red: "Red",
  you: "You",
  computer: "Computer",
  yourTurn: "Your turn (Blue)",
  computerTurn: "Computer is thinking…",
  forcedGanh: "A Gánh move exists — you must take it!",
  bluePieces: "Blue pieces",
  redPieces: "Red pieces",
  moveList: "Move list",
  noMovesYet: "No moves yet.",
  youWin: "You win! 🎉",
  youLose: "The computer wins!",
  winFlippedAll: "You flipped every Red piece.",
  loseFlippedAll: "The computer flipped all your Blue pieces.",
  winNoMoves: "Red has no legal move left.",
  loseNoMoves: "You have no legal move left.",
  resigned: "You resigned.",
  ganh: "Gánh",
  chet: "Chẹt",
  startHint: "You play Blue (bottom) and move first. Tap a piece to see its moves.",
  footer: "© SynerWork Inc. — Co Ganh, a Vietnamese folk board game.",
  privacy: "Privacy",
  terms: "Terms",
};

export const STRINGS: Record<Lang, Strings> = { vi, en };

const KEY = "cg-lang";
export function loadLang(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}
export function saveLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch { /* private mode */ }
}
