// Where this instance is reached, for absolute links in the API docs' metadata. Self-hosted
// installs set BETTER_AUTH_URL to their LAN address already, so it serves as the default.
export const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
