import type { Metadata } from "next";
import { PhoneRemote } from "@/components/remote/phone-remote";

export const metadata: Metadata = {
  title: "Mando · PK Anime",
  robots: { index: false, follow: false },
};

// Opened on the phone from the QR the TV shows in Cuenta
export default function LinkPage({ searchParams }: { searchParams: { code?: string } }) {
  return (
    <main lang="es" className="min-h-screen max-w-md mx-auto px-5 py-8 text-white">
      <PhoneRemote code={searchParams.code ?? null} />
    </main>
  );
}
