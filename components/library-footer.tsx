"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup } from "@/components/tv/focusable";
import { COPYRIGHTS, DISCLAIMER, LICENSE_NAME, THIRD_PARTY } from "@/lib/credits";

const copyrightLine = COPYRIGHTS.map(({ year, holder }) => `© ${year} ${holder}`).join(" · ");
// "Catálogo e imágenes de AniList, listas de MyAnimeList"
const creditLine = THIRD_PARTY.map((t) => `${t.credit} ${t.name}`).join(", ");

/**
 * License and credits at the end of every library page except the player. On TV it holds one
 * focusable button, so the remote can reach it (and scroll it into view) from the last row.
 */
export function LibraryFooter({ onFocus }: { onFocus?: (node: HTMLElement) => void }) {
  return useIsTv() ? <TvFooter onFocus={onFocus} /> : <WebFooter />;
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
