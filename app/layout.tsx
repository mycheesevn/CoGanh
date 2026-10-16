import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cờ Gánh — trò chơi dân gian Việt Nam",
  description:
    "Chơi Cờ Gánh với máy — trò chơi dân gian Việt Nam: đi một ô theo đường kẻ, Gánh lật đôi quân địch, Chẹt lật cả cụm bị vây. Miễn phí, tiếng Việt.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14100c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
      <Script id="sw-register" strategy="afterInteractive">
        {`if ("serviceWorker" in navigator) {
          if (document.readyState === "complete") {
            navigator.serviceWorker.register("/sw.js").catch(function () {});
          } else {
            window.addEventListener("load", function () {
              navigator.serviceWorker.register("/sw.js").catch(function () {});
            });
          }
        }`}
      </Script>
    </html>
  );
}
