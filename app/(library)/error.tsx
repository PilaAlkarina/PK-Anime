"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LibraryErrorScreen } from "@/components/library-error";

/**
 * A library screen that failed to load or render. Offline it says so, and loads again on its own
 * when the connection is back.
 */
export default function LibraryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.error("[library] Screen failed:", error);
    setOffline(navigator.onLine === false);
  }, [error]);

  const retry = () => {
    // Server data is fetched again too, not only the failed component
    router.refresh();
    reset();
  };

  useEffect(() => {
    if (!offline) return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // retry only closes over stable functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  return offline ? (
    <LibraryErrorScreen
      stamp="SIN CONEXIÓN"
      japanese="オフライン"
      title="No hay conexión a internet"
      text="Esta pantalla se cargará sola en cuanto vuelva la conexión."
      actions={[{ label: "Reintentar", primary: true, onSelect: retry }]}
    />
  ) : (
    <LibraryErrorScreen
      stamp="ERROR"
      japanese="エラー"
      title="Algo ha fallado"
      text="No se ha podido cargar esta pantalla. Suele arreglarse al reintentar; si no, AniList puede estar caído un momento."
      actions={[
        { label: "Reintentar", primary: true, onSelect: retry },
        { label: "Volver al inicio", onSelect: () => router.replace("/") },
      ]}
    />
  );
}
