import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { generateCodeChallenge, validateAuthorizationCode } from "better-auth/oauth2";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const clientId = process.env.MAL_CLIENT_ID || "";
const clientSecret = process.env.MAL_CLIENT_SECRET || "";

export const MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
const MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const MAL_USER_URL = "https://api.myanimelist.net/v2/users/@me";

/**
 * Stateless Better Auth: with no database configured, the session and the MyAnimeList
 * tokens live in encrypted (JWE) cookies, so the API needs nothing beyond env vars.
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
      config: [
        {
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
        },
      ],
    }),
  ],
});
