import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { LicenseScreen } from "@/components/license-screen";

export const metadata: Metadata = { title: "Licencia y créditos" };

// The repository's own LICENSE, read at build time so the page always matches it
const LICENSE_TEXT = readFileSync(join(process.cwd(), "LICENSE"), "utf8").trim();

export default function LicensePage() {
  return <LicenseScreen license={LICENSE_TEXT} />;
}
