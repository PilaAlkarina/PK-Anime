import { createStore } from "@/lib/library/storage";

/** Minutes without touching the remote before the TV screensaver starts; 0 turns it off */
export type ScreensaverMinutes = 0 | 3 | 5 | 10 | 30;

export const SCREENSAVER_OPTIONS: ScreensaverMinutes[] = [3, 5, 10, 30, 0];
const DEFAULT: ScreensaverMinutes = 5;

// Belongs to the TV, not to a profile (see DEVICE_KEYS in lib/library/profiles.ts)
export const SCREENSAVER_KEY = "pk_screensaver";

const store = createStore<ScreensaverMinutes>(SCREENSAVER_KEY, DEFAULT, (stored) =>
  SCREENSAVER_OPTIONS.includes(stored as ScreensaverMinutes) ? (stored as ScreensaverMinutes) : DEFAULT
);

export const useScreensaverMinutes = store.useValue;
export const setScreensaverMinutes = store.set;
