"use client";

import { FocusButton, FocusGroup, Screen } from "@/components/tv/focusable";

// Temporary home so the layout and remote navigation can be tried; replaced by the catalog home
export default function LibraryHomePage() {
  return (
    <Screen className="min-h-screen flex flex-col justify-center px-16">
      <h1 className="text-5xl font-bold">Inicio</h1>
      <p className="mt-4 text-2xl text-zinc-400">Usa las flechas, Enter y Atrás para moverte.</p>
      <FocusGroup className="mt-10 space-x-4">
        {["Uno", "Dos", "Tres"].map((label) => (
          <FocusButton key={label} variant="primary" onSelect={() => console.log("select", label)}>
            {label}
          </FocusButton>
        ))}
      </FocusGroup>
    </Screen>
  );
}
