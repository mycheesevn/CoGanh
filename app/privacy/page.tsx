import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Chính sách riêng tư / Privacy Policy — Cờ Gánh" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", lineHeight: 1.65 }}>
      <h1>Chính sách riêng tư — Cờ Gánh</h1>
      <p>Cờ Gánh là trò chơi cờ dân gian Việt Nam chạy hoàn toàn trên trình duyệt của bạn. Ở phiên bản hiện tại, trò chơi không thu thập, không lưu trữ và không chia sẻ bất kỳ dữ liệu cá nhân nào. Tiến trình chơi chỉ nằm trong bộ nhớ của trang; khi bạn đóng tab, ván cờ kết thúc.</p>
      <p>Ứng dụng có thể dùng bộ nhớ cục bộ (localStorage) để ghi nhớ tùy chọn của bạn như ngôn ngữ, âm thanh và cấp độ máy. Bạn có thể xóa các dữ liệu này bất cứ lúc nào trong phần cài đặt của trình duyệt.</p>
      <p><em>Cờ Gánh is a Vietnamese folk board game that runs entirely in your browser. This version collects, stores, and shares no personal data. Preferences such as language, sound, and AI level may be kept in localStorage and can be cleared in your browser settings at any time.</em></p>
      <p><Link href="/">← Quay lại trò chơi / Back to the game</Link></p>
    </main>
  );
}
