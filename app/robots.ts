import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/proxy/", "/api/play", "/embed/"],
      },
      {
        userAgent: "Googlebot",
        allow: ["/"],
        disallow: ["/api/proxy/", "/api/play", "/embed/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
