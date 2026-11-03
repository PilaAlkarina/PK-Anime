import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  $InferAuth: {} as typeof auth.options,
});
