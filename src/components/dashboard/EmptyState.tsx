import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared "nothing to show" state.
 *
 * Panels used to render their header and an empty table body, which reads as a
 * broken component rather than an empty window. Every empty state says what is
 * missing and what the user can do about it.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  className,
  compact = false,
}: {
  title: string;
  hint?: string;
  icon?: any;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
