/**
 * Text typed on the phone remote. The search screen listens for REMOTE_TEXT_EVENT while it's
 * open; text sent from another screen is kept here until search opens and takes it.
 */

export const REMOTE_TEXT_EVENT = "pk:remote-text";

let pending: string | null = null;

export function setPendingRemoteText(text: string) {
  pending = text;
}

export function takePendingRemoteText() {
  const text = pending;
  pending = null;
  return text;
}
