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
  };
}
