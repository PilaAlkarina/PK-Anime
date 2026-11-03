/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async headers() {
    return [
      {
        // Open CORS for the public API, but not for the cookie-authenticated auth and MAL routes
        source: "/api/:path((?!auth/|mal/).*)",
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
