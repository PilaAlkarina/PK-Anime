import { createStore } from "./storage";

export type AudioPreference = "sub" | "dub";

const audioStore = createStore<AudioPreference>("pk_library_audio", "sub");

export const useAudioPreference = audioStore.useValue;
export const getAudioPreference = audioStore.get;
export const setAudioPreference = audioStore.set;
