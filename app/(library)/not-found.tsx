"use client";

import { useRouter } from "next/navigation";
import { FocusButton, Screen } from "@/components/tv/focusable";

export default function LibraryNotFound() {
  const router = useRouter();
  return (
    <Screen className="flex flex-col items-start justify-center min-h-screen pl-12">
      <h1 className="text-4xl font-bold">No hemos encontrado este anime</h1>
      <p className="mt-3 text-xl text-zinc-400">Puede que el enlace sea incorrecto o que AniList ya no lo tenga.</p>
      <FocusButton variant="primary" className="mt-8" onSelect={() => router.replace("/")}>
        Volver al inicio
      </FocusButton>
    </Screen>
  );
}
