"use client";

import { useRouter } from "next/navigation";
import { Home, Search } from "lucide-react";
import { LibraryErrorScreen } from "@/components/library-error";

/** An anime, episode or address that doesn't exist */
export default function LibraryNotFound() {
  const router = useRouter();
  return (
    <LibraryErrorScreen
      figure="404"
      stamp="PERDIDO"
      japanese="迷子"
      title="Esta página no existe"
      text="Puede que el enlace esté mal escrito o que AniList ya no tenga este anime."
      actions={[
        { label: "Ir al inicio", icon: Home, primary: true, onSelect: () => router.replace("/") },
        { label: "Buscar un anime", icon: Search, onSelect: () => router.push("/search") },
      ]}
    />
  );
}
