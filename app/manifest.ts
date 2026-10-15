import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cờ Gánh",
    short_name: "Cờ Gánh",
    description:
      "Chơi Cờ Gánh với máy — trò chơi dân gian Việt Nam: Gánh lật đôi quân địch, Chẹt lật cả cụm bị vây kín.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14100c",
    theme_color: "#14100c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
