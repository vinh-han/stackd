import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stackd",
    short_name: "Stackd",
    description: "Paste anything. Get cards. Review daily.",
    start_url: "/",
    display: "standalone",
    background_color: "#121419",
    theme_color: "#121419",
    icons: [
      { src: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
}
