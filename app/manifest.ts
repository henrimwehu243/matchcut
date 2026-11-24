import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MatchCut — Soirées ciné, séries & animés",
    short_name: "MatchCut",
    description: "Choisissez ensemble quoi regarder ce soir : films, séries et animés entre amis.",
    start_url: "/decider",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}