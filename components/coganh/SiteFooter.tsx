/**
 * Shared SynerWorlds footer — identical content on every family site
 * (mirrors the hub footer at synerworlds.com): brand line, the family
 * game line, legal links (hosted on the hub) and the SynerWork
 * copyright. Links open in a new tab so a game in progress is never
 * lost by an accidental tap, and they are HandoffLinks: a signed-in
 * player arrives at the destination already signed in (full-mesh SSO).
 */

import HandoffLink from "./HandoffLink";

const GAMES: Array<{ vi: string; en: string; url: string }> = [
  { vi: "Cờ vua", en: "Chess", url: "https://chess.synerworlds.com" },
  { vi: "cờ tướng", en: "Xiangqi", url: "https://cotuong.synerworlds.com" },
  {
    vi: "cờ chiếu tướng",
    en: "Vietnamese General Check",
    url: "https://cochieutuong.synerworlds.com",
  },
  { vi: "cờ gánh", en: "Co Ganh", url: "https://coganh.synerworlds.com" },
  { vi: "cờ nhào", en: "Co Nhao", url: "https://conhao.synerworlds.com" },
  { vi: "ô ăn quan", en: "O An Quan", url: "https://oanquan.synerworlds.com" },
];

const HUB = "https://synerworlds.com";

export default function SiteFooter({
  lang,
  className,
}: {
  lang: "vi" | "en";
  className: string;
}) {
  const en = lang === "en";
  const q = en ? "?lang=en" : "";
  const linkStyle = { color: "inherit" } as const;
  return (
    <footer
      className={className}
      style={{
        lineHeight: 1.55,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: 16,
        rowGap: 0,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        <HandoffLink href={HUB} newTab style={linkStyle}>
          {en
            ? "SynerWorlds - One account, every world."
            : "SynerWorlds - Một tài khoản, mọi bàn cờ."}
        </HandoffLink>
      </div>
      <div>
        {GAMES.map((g, i) => (
          <span key={g.url}>
            {i > 0 ? ", " : ""}
            <HandoffLink href={g.url} newTab style={linkStyle}>
              {en ? g.en : g.vi}
            </HandoffLink>
          </span>
        ))}
        <span>,...</span>
      </div>
      <div>
        <HandoffLink href={`${HUB}/terms${q}`} newTab style={linkStyle}>
          {en ? "Terms of Service" : "Điều khoản dịch vụ"}
        </HandoffLink>
        {" · "}
        <HandoffLink href={`${HUB}/privacy${q}`} newTab style={linkStyle}>
          {en ? "Privacy Policy" : "Chính sách bảo mật"}
        </HandoffLink>
        {" · "}
        <HandoffLink href={`${HUB}/contact${q}`} newTab style={linkStyle}>
          {en ? "Contact" : "Liên hệ"}
        </HandoffLink>
        {" · "}
        {en
          ? "© SynerWork Inc. All rights reserved."
          : "© SynerWork Inc. Bảo lưu mọi quyền."}
      </div>
    </footer>
  );
}
