"use client";

import { useRouter } from "next/navigation";
import { LibraryErrorScreen } from "@/components/library-error";

/** An anime, episode or address that doesn't exist */
export default function LibraryNotFound() {
  const router = useRouter();
  return (
    <LibraryErrorScreen
      code="404"
      stamp="NO ENCONTRADO"
      japanese="見つかりません"
      title="Esta página no existe"
      text="Puede que el enlace esté mal, que el episodio no exista o que AniList ya no tenga este anime."
      actions={[
        { label: "Volver al inicio", primary: true, onSelect: () => router.replace("/") },
        { label: "Buscar un anime", onSelect: () => router.push("/search") },
      ]}
    />
  );
}
