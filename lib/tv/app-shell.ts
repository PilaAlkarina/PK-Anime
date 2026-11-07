/**
 * The Fire TV / Android TV app (android-tv/) shows the library in a WebView and adds
 * `window.PKAnimeTV` to it. In a TV browser it isn't there and these do nothing.
 */
type AppShell = { exit?: () => void; version?: () => string };

function appShell(): AppShell | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { PKAnimeTV?: AppShell }).PKAnimeTV) ?? null;
}

/** Closes the app; false when the library isn't running inside it */
export function exitApp(): boolean {
  const shell = appShell();
  if (!shell?.exit) return false;
  shell.exit();
  return true;
}
