import {
  getPlaybackPreferences,
  updatePlaybackPreferences,
  usePlaybackPreferences,
  type AudioPreference,
} from "@/lib/playback-preferences";

export type { AudioPreference };

// Sub/Dub lives with the rest of the playback preferences
export const useAudioPreference = () => usePlaybackPreferences().audio;
export const getAudioPreference = () => getPlaybackPreferences().audio;
export const setAudioPreference = (audio: AudioPreference) => updatePlaybackPreferences({ audio });
