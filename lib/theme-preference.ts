import { createStore } from "@/lib/library/storage";
import { DEFAULT_THEME, getTheme, isThemeId, type ThemeId } from "@/lib/themes";

/**
 * The color theme chosen in Ajustes, per browser. Its key is read before the first paint by
 * THEME_BOOT_SCRIPT, so it lives apart from the playback preferences.
 */
const store = createStore<ThemeId>("pk_theme", DEFAULT_THEME, (stored) => (isThemeId(stored) ? stored : DEFAULT_THEME));

export const useThemePreference = store.useValue;

export function setThemePreference(id: ThemeId) {
  store.set(id);
  document.documentElement.setAttribute("data-theme", id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getTheme(id).palette.ink);
}
