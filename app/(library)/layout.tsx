import type { Metadata } from "next";
import { NavigationProvider } from "@/components/tv/navigation-provider";
import { Sidebar } from "@/components/tv/sidebar";
import { TvLinkProvider } from "@/components/tv/tv-link";
import { UiModeProvider } from "@/components/ui-mode";
import { WebShell } from "@/components/web/web-shell";
import { NavigationProgress } from "@/components/navigation-progress";
import { getUiMode } from "@/lib/ui-mode-server";
import { ProfileGate } from "@/components/profiles";
import "./library.css";

export const metadata: Metadata = {
  title: { default: "PK Anime", template: "%s · PK Anime" },
  robots: { index: false, follow: false },
};

// Designed on a 1920×1080 grid where 1rem = 16px. TV browsers often report a 960 or 1280 px
// wide viewport, so the root font size follows the width and everything scales with it.
// Rendered as an element so it goes away when leaving the library.
const TV_SCALE = `html{font-size:calc(100vw / 120)}@media (max-width:959px){html{font-size:16px}}`;

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const mode = getUiMode();

  if (mode === "web") {
    return (
      <UiModeProvider mode="web">
        {/* A phone can link here too; once it does, the page moves to the TV interface */}
        <TvLinkProvider>
          <div data-ui="web">
            <NavigationProgress />
            <WebShell>
              <ProfileGate>{children}</ProfileGate>
            </WebShell>
          </div>
        </TvLinkProvider>
      </UiModeProvider>
    );
  }

  return (
    <UiModeProvider mode="tv">
      <NavigationProvider>
        <TvLinkProvider>
          <style dangerouslySetInnerHTML={{ __html: TV_SCALE }} />
          <div data-ui="tv" lang="es" className="relative min-h-screen bg-black text-white overflow-hidden">
            <NavigationProgress />
            <Sidebar />
            <main className="pl-[7rem]">
              <ProfileGate>{children}</ProfileGate>
            </main>
          </div>
        </TvLinkProvider>
      </NavigationProvider>
    </UiModeProvider>
  );
}
