import { cn } from "@/lib/utils";

export type PanelScope = "launch" | "dashboard";

export const PANEL_SCOPE_OPTIONS: { key: PanelScope; label: string }[] = [
  { key: "launch", label: "Since launch" },
  { key: "dashboard", label: "Dashboard range" },
];

interface PanelScopeToggleProps {
  scope: PanelScope;
  onScopeChange: (scope: PanelScope) => void;
  className?: string;
}

export function PanelScopeToggle({ scope, onScopeChange, className }: PanelScopeToggleProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {PANEL_SCOPE_OPTIONS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onScopeChange(item.key)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.08em] transition-colors",
            scope === item.key ? "bg-brand text-white shadow-sm" : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
