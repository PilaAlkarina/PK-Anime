"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Scale } from "lucide-react";
import { useIsTv } from "@/components/ui-mode";
import { useServiceStatus } from "@/lib/use-service-status";
import { cn } from "@/lib/utils";
import { FocusButton, FocusGroup } from "@/components/tv/focusable";
import { COPYRIGHTS, DISCLAIMER, LICENSE_NAME, THIRD_PARTY } from "@/lib/credits";

const copyrightLine = COPYRIGHTS.map(({ year, holder }) => `© ${year} ${holder}`).join(" · ");
// "Catálogo e imágenes de AniList, listas de MyAnimeList"
const creditLine = THIRD_PARTY.map((t) => `${t.credit} ${t.name}`).join(", ");

/**
 * License, credits and the server status link at the end of every library page except the
 * player. On TV its buttons are focusable, so the remote can reach them (and scroll the footer
 * into view) from the last row.
 */
export function LibraryFooter({ onFocus }: { onFocus?: (node: HTMLElement) => void }) {
  return useIsTv() ? <TvFooter onFocus={onFocus} /> : <WebFooter />;
}

const STATUS_DOT = { ok: "bg-emerald-400", degraded: "bg-amber-400", down: "bg-red-500" } as const;

/**
 * Dot for the last status check: green, amber when a server is slow, red when one is down.
 * It only reads the last result, so showing it never starts a check.
 */
function StatusDot({ className }: { className?: string }) {
  const { services } = useServiceStatus({ peek: true });
  const servers = services.filter((s) => s.kind === "server");
  if (servers.length === 0) return null;
  const worst = servers.some((s) => s.state === "down")
    ? "down"
    : servers.some((s) => s.state === "degraded")
      ? "degraded"
      : "ok";
  return <span aria-hidden className={cn("inline-block flex-shrink-0 rounded-full", STATUS_DOT[worst], className)} />;
}

function TvFooter({ onFocus }: { onFocus?: (node: HTMLElement) => void }) {
  const router = useRouter();
  return (
    <footer className="mt-16 pt-8 border-t-2 border-zinc-900 text-lg text-zinc-500">
      {/* Reveals the whole footer, not only the button's row */}
      <FocusGroup
        className="flex flex-wrap items-center"
        onFocusInside={(node) => onFocus?.((node.closest("footer") as HTMLElement | null) ?? node)}
      >
        <FocusButton variant="chip" className="mr-6" onSelect={() => router.push("/license")}>
          <Scale className="w-5 h-5 mr-2.5" />
          Licencia {LICENSE_NAME} y créditos
        </FocusButton>
        <FocusButton variant="chip" className="mr-6" onSelect={() => router.push("/status")}>
          <Activity className="w-5 h-5 mr-2.5" />
          Estado de los servidores
          <StatusDot className="w-2.5 h-2.5 ml-2.5" />
        </FocusButton>
        <p>
          PK Anime, basado en AniFlow · {copyrightLine} · {creditLine}
        </p>
      </FocusGroup>
      <p className="mt-3">{DISCLAIMER}</p>
    </footer>
  );
}

function WebFooter() {
  return (
    <footer className="border-t border-zinc-900 text-sm text-zinc-500">
      <div className="max-w-[1360px] mx-auto px-4 py-8 md:px-8 space-y-2">
        <Link
          href="/status"
          className="inline-flex items-center gap-2 mb-2 h-9 px-3 -ml-3 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900"
        >
          <Activity className="w-4 h-4" aria-hidden />
          Estado de los servidores
          <StatusDot className="w-2 h-2" />
        </Link>
        <p>
          PK Anime, basado en{" "}
          <a href={COPYRIGHTS[0].url} target="_blank" rel="noreferrer" className="underline hover:text-white">
            AniFlow
          </a>
          . {copyrightLine}. Código bajo{" "}
          <Link href="/license" className="underline hover:text-white">
            licencia {LICENSE_NAME}
          </Link>
          .
        </p>
        <p>
          {THIRD_PARTY.map((t, i) => (
            <span key={t.name}>
              {i > 0 && ", "}
              {t.credit}{" "}
              <a href={t.url} target="_blank" rel="noreferrer" className="underline hover:text-white">
                {t.name}
              </a>
            </span>
          ))}
          . {DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
