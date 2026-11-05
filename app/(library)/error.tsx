"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, RotateCcw } from "lucide-react";
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

  // In production React hides server errors' messages behind a digest; that's still worth showing
  const cause = error.message && !/omitted in production/i.test(error.message) ? error.message : error.digest ? `Código ${error.digest}` : null;

  return offline ? (
    <LibraryErrorScreen
      figure="圏外"
      stamp="SIN CONEXIÓN"
      japanese="オフライン"
      title="No hay conexión a internet"
      text="Esta pantalla se cargará sola en cuanto vuelva la conexión."
      actions={[{ label: "Reintentar", icon: RotateCcw, primary: true, onSelect: retry }]}
    />
  ) : (
    <LibraryErrorScreen
      figure="失敗"
      stamp="ERROR"
      japanese="失敗"
      title="Algo ha fallado"
      text="No se ha podido cargar esta pantalla. Suele arreglarse volviendo a intentarlo en unos segundos."
      cause={cause}
      actions={[
        { label: "Reintentar", icon: RotateCcw, primary: true, onSelect: retry },
        { label: "Ir al inicio", icon: Home, onSelect: () => router.replace("/") },
      ]}
    />
  );
}
