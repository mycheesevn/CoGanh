"use client";
import React from "react";
import type { Lang } from "@/lib/coganh/i18n";

export default function HowToView({ lang }: { lang: Lang }) {
  if (lang === "en") {
    return (
      <div className="cg-scroll-area">
        <div className="cg-howto">
          <h2>How to play Co Ganh</h2>
          <p>All 16 pieces are equal — there is no king and no ranks. You play <strong>Blue</strong> (bottom) and move first; the computer plays Red.</p>
          <h3>Moving</h3>
          <p>On your turn, move one piece along a drawn line (horizontal, vertical, or diagonal where a dashed line exists) to the adjacent empty point. One move per turn, no jumping.</p>
          <h3>Gánh — sandwich flip</h3>
          <p>When your piece moves INTO the point exactly between two enemy pieces (three in a straight line), both enemy pieces flip to your colour. A single landing can flip pairs on several axes at once — a multi-axis Gánh is the strongest blow in the game. Pieces further along the line are not affected.</p>
          <h3>Chẹt — surround flip</h3>
          <p>If an enemy piece — or a connected enemy group (connected along any drawn line, diagonals included) — is left with no empty neighbouring point at all, the whole group flips to your colour. Surrounding your OWN pieces is safe: a self-locked “fortress” is never flipped by your own move.</p>
          <h3>Luật Mở — forced Gánh</h3>
          <p>If a Gánh move is available, you MUST take one — you may not play a quiet move instead. When several Gánh moves exist, you freely choose which one to play.</p>
          <h3>Winning and losing</h3>
          <p>You lose when all your pieces have been flipped, or when your turn comes and you have no legal move, or when you resign. There is no traditional draw — games almost always produce a winner.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="cg-scroll-area">
      <div className="cg-howto">
        <h2>Cách chơi Cờ Gánh</h2>
        <p>Cả 16 quân đều bình đẳng — không có Tướng, không cấp bậc. Bạn cầm quân <strong>Xanh</strong> (phía dưới) và đi trước; máy cầm quân Đỏ.</p>
        <h3>Đi quân</h3>
        <p>Đến lượt, di chuyển 1 quân theo đường kẻ (ngang, dọc, hoặc chéo nơi có đường chéo) sang điểm trống kề ngay. Mỗi lượt một nước, không nhảy qua quân khác.</p>
        <h3>Gánh — lật đôi</h3>
        <p>Khi quân của bạn đi vào điểm nằm chính giữa 2 quân địch (3 điểm liên tiếp thẳng hàng), cả 2 quân địch hai đầu lật thành quân của bạn. Một nước đi có thể Gánh đồng thời trên nhiều trục — Gánh đa trục là đòn mạnh nhất của trò chơi. Quân địch nằm xa hơn trên cùng hàng không bị ảnh hưởng.</p>
        <h3>Chẹt — vây bắt</h3>
        <p>Nếu một quân địch — hoặc cả cụm quân địch liên thông (nối nhau theo mọi đường kẻ, kể cả đường chéo) — không còn bất kỳ điểm trống kề nào, toàn bộ cụm đó lật thành quân của bạn. Ngược lại, tự khóa quân mình là an toàn: “pháo đài cố thủ” không bao giờ bị lật bởi chính nước đi của bạn.</p>
        <h3>Luật Mở — bắt buộc Gánh</h3>
        <p>Nếu có nước Gánh, bạn BẮT BUỘC phải Gánh — không được đi nước thường thay thế. Khi có nhiều nước Gánh, bạn được tự do chọn một nước bất kỳ.</p>
        <h3>Thắng thua</h3>
        <p>Bạn thua khi bị lật hết quân, hoặc đến lượt mà không còn nước đi hợp lệ, hoặc khi xin thua. Cờ Gánh truyền thống không có hòa — ván đấu hầu như luôn tìm được người thắng.</p>
      </div>
    </div>
  );
}
