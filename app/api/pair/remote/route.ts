import { NextRequest } from "next/server";
import {
  emit,
  findByController,
  REMOTE_DESTINATIONS,
  REMOTE_KEYS,
  touch,
  type RemoteCommand,
  type RemoteKey,
} from "@/lib/pairing/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

const MAX_TEXT = 60;

function parseCommand(input: unknown): RemoteCommand | null {
  if (!input || typeof input !== "object") return null;
  const cmd = input as Record<string, unknown>;
  if (cmd.kind === "key" && REMOTE_KEYS.includes(cmd.key as RemoteKey)) return { kind: "key", key: cmd.key as RemoteKey };
  if (cmd.kind === "text" && typeof cmd.text === "string") return { kind: "text", text: cmd.text.slice(0, MAX_TEXT) };
  if (cmd.kind === "navigate" && REMOTE_DESTINATIONS.includes(cmd.href as string)) {
    return { kind: "navigate", href: cmd.href as string };
  }
  if (cmd.kind === "signout") return { kind: "signout" };
  return null;
}

/** GET /api/pair/remote?token={controllerToken}: whether the phone is still linked */
export async function GET(request: NextRequest) {
  const link = findByController(request.nextUrl.searchParams.get("token"));
  return pairJson({ success: true, linked: !!link, tvListening: !!link && link.listeners.size > 0 });
}

/** POST /api/pair/remote { token, command }: forwards a remote-control command to the TV */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByController(body.token);
  if (!link) return pairJson({ success: false, code: "NOT_LINKED", error: "This phone is not linked" }, 404);
  const command = parseCommand(body.command);
  if (!command) return pairJson({ success: false, error: "Unknown command" }, 400);
  touch(link);
  emit(link, { type: "command", command });
  return pairJson({ success: true, delivered: link.listeners.size > 0 });
}
