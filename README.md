# Cờ Chiếu Tướng — v1

Trò chơi dân gian Cờ Chiếu Tướng: đấu với máy (12 cấp độ) hoặc 2 người chơi
trên cùng máy. Luật chơi đầy đủ: [`docs/RULES.md`](docs/RULES.md).

## Chạy

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Kiểm thử engine

```bash
npm run test:engine   # 38 assertions: perft, captures, check/mate/stalemate, draw, fuzz
```

## Cấu trúc

- `lib/cct/engine.ts` — luật chơi thuần túy (state, nước đi, chiếu, kết thúc, perft)
- `lib/cct/ai.ts` — negamax + alpha-beta + transposition table + iterative deepening, 12 cấp độ, đánh cho Xanh
- `lib/cct/sound.ts` — WebAudio synth (đi/ăn/chiếu/thắng/thua)
- `lib/cct/i18n.ts` — VI/EN (mặc định VI)
- `lib/cct/iconSvg.ts` / `iconResponse.ts` — 1 SVG nguồn cho mọi icon (`ICON_VERSION = 1`, mọi URL icon có `?v=1`)
- `components/cct/` — `Board.tsx` (SVG theo bản vẽ đã duyệt), `PlayView.tsx`,
  `TwoPlayerView.tsx`, `HowToView.tsx`, `AppShell.tsx` (header/drawer theo
  boardgame-engagement shell)

## Ghi chú v1

- Chưa có tài khoản/phòng/mạng — tài khoản và các tính năng online ở giai đoạn sau.
- UI theo đúng shell của PacClone/Chess (cùng header, drawer, panel, âm thanh,
  i18n); chỉ khác bàn cờ và luật chơi.
