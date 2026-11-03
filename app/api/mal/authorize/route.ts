import { NextRequest, NextResponse } from "next/server";
import { MAL_AUTHORIZE_URL } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Better Auth always sends PKCE as S256, while MyAnimeList only supports "plain".
 * Forward the authorization request to MAL with the method switched; the challenge
 * value itself is kept, and lib/auth.ts sends it back as the verifier.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  if (params.has("code_challenge")) params.set("code_challenge_method", "plain");
  return NextResponse.redirect(`${MAL_AUTHORIZE_URL}?${params}`);
}
