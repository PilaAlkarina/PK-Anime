/**
 * A navigation the phone remote started, until the new page shows. Meanwhile the page being left
 * mustn't rewrite its own URL (the search writing its query with history.replaceState): Next takes
 * that as being on that URL and drops the navigation in flight, so on a slow TV the first tap on a
 * result did nothing. Time-limited, in case the navigation never lands.
 */
const LEAVING_MS = 8000;

let leavingUntil = 0;

export const markLeaving = () => {
  leavingUntil = Date.now() + LEAVING_MS;
};

export const clearLeaving = () => {
  leavingUntil = 0;
};

export const isLeaving = () => Date.now() < leavingUntil;
