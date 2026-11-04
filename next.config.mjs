import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LegacyDownlevelPlugin } = require("./next-legacy-downlevel.cjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Lets a test build go to another folder without touching the one a server is running from
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config, { isServer, dev }) {
    // Production browser bundles are rewritten to ES2017 for older Smart TV browsers
    if (!isServer && !dev) config.plugins.push(new LegacyDownlevelPlugin());
    return config;
  },
  async headers() {
    return [
      {
        // Open CORS for the public API, but not for the cookie-authenticated auth, MAL, tracker
        // and TV pairing routes
        source: "/api/:path((?!auth/|mal/|tracker/|pair/).*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS, HEAD" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ["@consumet/extensions", "got-scraping", "anime-sdk"],
  },
};

export default nextConfig;
