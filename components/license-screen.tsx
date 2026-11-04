"use client";

import { useRouter } from "next/navigation";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup } from "@/components/tv/focusable";
import { PageFrame } from "@/components/tv/page-frame";
import { COPYRIGHTS, DISCLAIMER, LICENSE_NAME, THIRD_PARTY } from "@/lib/credits";
import { cn } from "@/lib/utils";

/** The MIT license text next to who holds the rights and which services the library uses */
export function LicenseScreen({ license }: { license: string }) {
  const router = useRouter();
  const isTv = useIsTv();

  const heading = cn("font-bold text-white", isTv ? "text-2xl" : "text-lg");
  const body = cn("text-zinc-400", isTv ? "text-lg leading-relaxed" : "text-sm leading-relaxed");
  const link = "underline hover:text-white";

  return (
    <PageFrame
      title="Licencia y créditos"
      subtitle={`PK Anime es software libre bajo la licencia ${LICENSE_NAME}, basado en AniFlow.`}
      footer={false}
    >
      {/* On TV the remote needs something to land on; Back works too */}
      {isTv && (
        <FocusGroup className="mb-8">
          <FocusButton variant="secondary" onSelect={() => router.back()}>
            Volver
          </FocusButton>
        </FocusGroup>
      )}
      <div className={cn(isTv ? "flex items-start" : "grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
        <section className={cn(isTv && "w-[52%] mr-12")}>
          <h2 className={heading}>Licencia {LICENSE_NAME}</h2>
          <pre
            className={cn(
              "mt-4 p-5 rounded-xl bg-zinc-900 text-zinc-300 font-mono whitespace-pre-wrap break-words",
              isTv ? "text-base leading-relaxed" : "text-xs sm:text-sm leading-relaxed"
            )}
          >
            {license}
          </pre>
        </section>

        <div className={cn(isTv && "flex-1")}>
          <section>
            <h2 className={heading}>Derechos de autor</h2>
            <ul className={cn("mt-3", body)}>
              {COPYRIGHTS.map(({ year, holder, role, url }) => (
                <li key={holder} className="mt-1">
                  © {year}{" "}
                  {url && !isTv ? (
                    <a href={url} target="_blank" rel="noreferrer" className={link}>
                      {holder}
                    </a>
                  ) : (
                    holder
                  )}{" "}
                  ({role})
                </li>
              ))}
            </ul>
            <p className={cn("mt-3", body)}>
              La licencia permite usar, copiar, modificar y distribuir el código siempre que se conserve este aviso
              de copyright y de permiso.
            </p>
          </section>

          <section className="mt-8">
            <h2 className={heading}>Servicios de terceros</h2>
            <ul className={cn("mt-3", body)}>
              {THIRD_PARTY.map(({ name, url, note }) => (
                <li key={name} className="mt-2">
                  <span className="font-semibold text-zinc-200">
                    {isTv ? (
                      name
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className={link}>
                        {name}
                      </a>
                    )}
                  </span>
                  : {note}
                </li>
              ))}
            </ul>
            <p className={cn("mt-3", body)}>{DISCLAIMER}</p>
          </section>
        </div>
      </div>
    </PageFrame>
  );
}
