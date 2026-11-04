import { betterAuth } from "better-auth";
import { genericOAuth, type GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { generateCodeChallenge, validateAuthorizationCode } from "better-auth/oauth2";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const clientId = process.env.MAL_CLIENT_ID || "";
const clientSecret = process.env.MAL_CLIENT_SECRET || "";

export const MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
const MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const MAL_USER_URL = "https://api.myanimelist.net/v2/users/@me";

const anilistClientId = process.env.ANILIST_CLIENT_ID || "";
const anilistClientSecret = process.env.ANILIST_CLIENT_SECRET || "";

const myAnimeList: GenericOAuthConfig = {
  providerId: "myanimelist",
  name: "MyAnimeList",
  clientId,
  clientSecret,
  // MAL only accepts PKCE with code_challenge_method=plain, which Better Auth never sends.
  // This local route rewrites the method before redirecting to MAL; see getToken below.
  authorizationUrl: `${baseURL}/api/mal/authorize`,
  tokenUrl: MAL_TOKEN_URL,
  pkce: true,
  // With "plain", MAL compares code_verifier to the challenge verbatim, and the challenge
  // it received is the S256 hash of Better Auth's verifier, so send that hash back.
  async getToken({ code, redirectURI, codeVerifier }) {
    return validateAuthorizationCode({
      code,
      redirectURI,
      codeVerifier: codeVerifier ? await generateCodeChallenge(codeVerifier) : undefined,
      options: { clientId, clientSecret },
      tokenEndpoint: MAL_TOKEN_URL,
    });
  },
  async getUserInfo(tokens) {
    const res = await fetch(MAL_USER_URL, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) return null;
    const profile = await res.json();
    return {
      id: String(profile.id),
      name: profile.name,
      image: profile.picture || undefined,
      // MAL never shares the account email; Better Auth requires one, so use a
      // per-user placeholder on the reserved .invalid TLD
      email: `mal-${profile.id}@myanimelist.invalid`,
      emailVerified: false,
    };
  },
  overrideUserInfo: true,
};

// AniList tokens last about a year and come without a refresh token; signing in again renews them
const aniList: GenericOAuthConfig = {
  providerId: "anilist",
  name: "AniList",
  clientId: anilistClientId,
  clientSecret: anilistClientSecret,
  authorizationUrl: "https://anilist.co/api/v2/oauth/authorize",
  tokenUrl: "https://anilist.co/api/v2/oauth/token",
  async getUserInfo(tokens) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({ query: "query { Viewer { id name avatar { large } } }" }),
    });
    if (!res.ok) return null;
    const viewer = (await res.json())?.data?.Viewer;
    if (!viewer) return null;
    return {
      id: String(viewer.id),
      name: viewer.name,
      image: viewer.avatar?.large || undefined,
      // AniList doesn't share the email either
      email: `anilist-${viewer.id}@anilist.invalid`,
      emailVerified: false,
    };
  },
  overrideUserInfo: true,
};

/**
 * Stateless Better Auth: with no database configured, the session and the list service tokens
 * (MyAnimeList or AniList) live in encrypted (JWE) cookies, so the API needs nothing beyond
 * env vars. Each provider's users get a placeholder email naming the provider, which is how
 * lib/trackers tells them apart.
 */
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60,
      strategy: "jwe",
      refreshCache: true,
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      // AniList only with credentials: an empty client ID makes its sign-in request fail
      config: [myAnimeList, ...(anilistClientId && anilistClientSecret ? [aniList] : [])],
    }),
  ],
});
