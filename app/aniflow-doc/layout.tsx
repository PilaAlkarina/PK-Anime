import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/aniflow-doc",
  },
};

export default function AniflowDocLayout({ children }: { children: React.ReactNode }) {
  return children;
}
