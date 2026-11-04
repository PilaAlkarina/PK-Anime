import { cn } from "@/lib/utils";

/** Remote-control legend for the TV layout: [key, what it does] */
export function RemoteHints({ hints, className }: { hints: [string, string][]; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-[1.625rem] px-[1.625rem] py-3.5 rounded-full bg-black/80 text-[1.3125rem] text-zinc-300 pointer-events-none",
        className
      )}
    >
      {hints.map(([key, label]) => (
        <span key={label} className="flex items-center gap-2.5">
          <span className="px-3 py-0.5 rounded-lg border-2 border-zinc-500 font-bold">{key}</span>
          {label}
        </span>
      ))}
    </div>
  );
}
