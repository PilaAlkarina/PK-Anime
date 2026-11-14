"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

/** Errors from the sign-in request itself, before leaving for the provider (Better Auth codes) */
const REQUEST_ERRORS: Record<string, string> = {
  INVALID_ORIGIN:
    "El servidor no acepta peticiones desde esta dirección: no coincide con su BETTER_AUTH_URL. Abre la web con esa dirección o cámbiala en el .env.local del servidor.",
  MISSING_OR_NULL_ORIGIN: "El navegador no dijo desde qué dirección se pide el inicio de sesión. Recarga la página y vuelve a intentarlo.",
  INVALID_CALLBACK_URL: "El servidor no acepta la página de vuelta tras iniciar sesión. Revisa BETTER_AUTH_URL en su .env.local.",
};

/** Errors Better Auth puts in ?error= when the provider sends the browser back */
const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "Se canceló el inicio de sesión en el servicio.",
  state_mismatch: "El inicio de sesión caducó o empezó en otra pestaña. Vuelve a intentarlo.",
  state_not_found: "El inicio de sesión caducó o empezó en otra pestaña. Vuelve a intentarlo.",
  please_restart_the_process: "El inicio de sesión caducó. Vuelve a intentarlo.",
  invalid_code: "El servicio no devolvió un código válido. Vuelve a intentarlo.",
  no_code: "El servicio no devolvió un código. Vuelve a intentarlo.",
  unable_to_get_user_info: "Se entró en el servicio, pero no se pudo leer tu perfil.",
  oauth_provider_not_found: "Este servidor no tiene configurado ese servicio.",
  invalid_callback_request: "La vuelta desde el servicio llegó incompleta. Vuelve a intentarlo.",
  internal_server_error: "El servidor falló al terminar el inicio de sesión. Mira su consola.",
};

type RequestError = { status?: number; statusText?: string; code?: string; message?: string };

function describeRequestError(error: RequestError): string {
  if (error.status === 429) return "Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (error.code && REQUEST_ERRORS[error.code]) return REQUEST_ERRORS[error.code];
  if (!error.status) return "No se pudo contactar con el servidor. Comprueba la conexión.";
  const detail = error.message || error.statusText || `error ${error.status}`;
  return `No se pudo iniciar sesión: ${detail}${error.code ? ` (${error.code})` : ""}.`;
}

function describeCallbackError(code: string, description: string | null): string {
  const known = CALLBACK_ERRORS[code.toLowerCase()];
  if (known) return known;
  return `No se pudo iniciar sesión (${description || code}).`;
}

/**
 * Sign in with a list service. On success the browser leaves for the provider and this never
 * resolves to anything useful; on failure it resolves to a message to show. Errors after the
 * provider (in the callback) come back to `callbackURL` as ?error=, read by useSignInError.
 */
export async function signInWith(provider: string, callbackURL: string): Promise<string | null> {
  try {
    const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL });
    return error ? describeRequestError(error) : null;
  } catch {
    return "No se pudo contactar con el servidor. Comprueba la conexión.";
  }
}

/**
 * The sign-in error to show on this page: one left by the provider's callback in the address
 * (removed from it once read), or one set from signInWith.
 */
export function useSignInError(): [string | null, (message: string | null) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("error");
    if (!code) return;
    setMessage(describeCallbackError(code, url.searchParams.get("error_description")));
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    // Through the router: the app router rewrites the address after this effect, from its own state
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  }, [router]);

  return [message, setMessage];
}
