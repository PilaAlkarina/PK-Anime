"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const BACK_ONLINE_MS = 3000;

/**
 * A strip at the top while the device is offline (what's loaded stays usable), and a brief
 * "back online" when the connection returns. Both interfaces.
 */
export function OfflineNotice() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState((s) => (s === "offline" ? "back" : s));
      timer = setTimeout(() => setState("online"), BACK_ONLINE_MS);
    };
    if (navigator.onLine === false) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  if (state === "online") return null;
  const back = state === "back";
  return (
    <div
      role="status"
      className={cn(
        "fixed top-0 left-0 right-0 z-[90] flex items-center justify-center gap-2.5 px-4 py-2 text-sm font-bold page-in",
        "tv:py-3 tv:text-xl tv:gap-3",
        back ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white border-b-[1.5px] border-red-500"
      )}
    >
      {back ? <Wifi className="w-4 h-4 tv:w-6 tv:h-6" /> : <WifiOff className="w-4 h-4 text-red-500 tv:w-6 tv:h-6" />}
      {back ? "Conexión recuperada" : "Sin conexión a internet: lo que ya está cargado sigue disponible"}
    </div>
  );
}
