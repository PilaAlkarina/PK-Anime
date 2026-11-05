"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const BACK_ONLINE_MS = 3000;

/**
 * A strip under the top bar (beside the rail on TV) while the device is offline: what's loaded
 * stays usable. When the connection returns it turns green for a few seconds and goes.
 */
export function OfflineNotice() {
  const router = useRouter();
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
        "fixed left-0 right-0 top-0 z-[39] flex items-center gap-3 px-4 py-2.5 bg-ink-3 border-b-[1.5px] border-line text-[0.9rem] page-in md:top-16 md:px-8",
        "tv:top-0 tv:left-[7rem] tv:px-8 tv:py-3 tv:text-[1.4rem] tv:gap-4",
        // A bar in the second accent down the left edge; green once the connection is back
        back ? "shadow-[inset_0.3em_0_0_rgb(74,222,128)]" : "shadow-[inset_0.3em_0_0_rgb(var(--c-second))]"
      )}
    >
      {back ? (
        <Wifi className="w-[1.3em] h-[1.3em] flex-none text-green-400" />
      ) : (
        <WifiOff className="w-[1.3em] h-[1.3em] flex-none text-amber-500" />
      )}
      <b className="font-bold">{back ? "Conexión recuperada." : "Sin conexión."}</b>
      <span className="text-zinc-400 truncate">
        {back ? "Ya está todo al día." : "Lo que ya está cargado sigue disponible; lo nuevo, cuando vuelva internet."}
      </span>
      {!back && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="ml-auto flex-none h-9 px-4 rounded-full bg-ink-3 border-[1.5px] border-line text-[0.85em] font-bold hover:bg-zinc-800 tv:hidden"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
