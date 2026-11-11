import { cn } from "@/lib/utils";

/** Remote-control legend for the TV layout: [key, what it does]; arrow and Back keys as <RemoteKeys> */
export function RemoteHints({
  hints,
  compact = false,
  className,
}: {
  hints: [React.ReactNode, string][];
  /** Slightly smaller, for the bar under the video while it plays */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-full bg-zinc-900/90 border border-line text-zinc-200 pointer-events-none",
        compact ? "gap-[1.375rem] px-[1.375rem] py-3 text-[1.1875rem]" : "gap-[1.625rem] px-[1.625rem] py-3.5 text-[1.3125rem]",
        className
      )}
    >
      {hints.map(([key, label]) => (
        <span key={label} className="flex items-center gap-2.5">
          <span className={cn("py-0.5 rounded-md border-[1.5px] border-b-[3px] border-zinc-500 font-black", compact ? "px-2.5" : "px-3")}>{key}</span>
          {label}
        </span>
      ))}
    </div>
  );
}
