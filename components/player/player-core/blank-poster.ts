/**
 * A transparent 1×1 poster for <video> elements. Without a poster, Android's web view (the Fire TV
 * app) loads its own default one, a grey play icon; on a crossOrigin video that load is blocked by
 * CORS and fires "error" on the video, which looks like a playback failure.
 */
export const BLANK_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
