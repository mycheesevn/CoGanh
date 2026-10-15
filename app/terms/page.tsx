import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Điều khoản sử dụng / Terms — Cờ Gánh" };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", lineHeight: 1.65 }}>
      <h1>Điều khoản sử dụng — Cờ Gánh</h1>
      <p>Cờ Gánh được cung cấp miễn phí cho mục đích giải trí và học tập. Luật chơi áp dụng là luật dân gian đã được cộng đồng người chơi xác nhận: quân đi một ô theo đường kẻ, Gánh lật đôi quân địch hai đầu, Chẹt lật cụm quân bị vây kín, và Luật Mở bắt buộc phải Gánh khi có nước Gánh. Kết quả ván đấu với máy chỉ phục vụ giải trí.</p>
      <p><em>Cờ Gánh is provided free of charge for entertainment and learning. The game applies the community-confirmed folk rules: one-step moves along the drawn lines, Gánh flips the two flanking enemy pieces, Chẹt flips a fully surrounded group, and Luật Mở forces a Gánh move whenever one exists.</em></p>
      <p><Link href="/">← Quay lại trò chơi / Back to the game</Link></p>
    </main>
  );
}
