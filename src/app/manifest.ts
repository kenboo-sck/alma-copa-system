import type { MetadataRoute } from "next";

const iconVersion = "20260527";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "COPA ALMA Entry System",
    short_name: "COPA ALMA",
    description: "COPA ALMA tournament entry and administration system.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      {
        src: `/favicon.svg?v=${iconVersion}`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: `/android-chrome-192x192.png?v=${iconVersion}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `/android-chrome-512x512.png?v=${iconVersion}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
