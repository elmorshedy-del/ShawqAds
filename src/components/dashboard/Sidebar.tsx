import { CalendarDays, Check, Search, SlidersHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DateRange {
  since: string;
  until: string;
}

export interface AdSetOption {
  id: string;
  name: string;
}

export interface StatusOption {
  value: string;
  label: string;
}

/** Date-window presets — mirrors the live App preset contract exactly. */
export const datePresets: { value: string; label: string; description: string }[] = [
  { value: "today", label: "Today", description: "Current Istanbul day" },
  { value: "yesterday", label: "Yesterday", description: "Previous Istanbul day" },
  { value: "last7", label: "Last week", description: "Rolling 7-day view" },
  { value: "launch", label: "June 3 CBO campaign launch", description: "New Meta CBO campaigns from launch day onward" },
  { value: "all", label: "Matched data", description: "All days with Meta + Shopify" },
  { value: "custom", label: "Date range", description: "Exact start and end" },
];

export interface SidebarProps {
  selected: string;
  onSelected: (value: string) => void;
  adSets: AdSetOption[];
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  statuses: StatusOption[];
  query: string;
  onQuery: (value: string) => void;
  range: DateRange;
  preset: string;
  isDateOpen: boolean;
  onToggleDate: () => void;
  customRange: DateRange;
  onCustomChange: (range: DateRange) => void;
  onPreset: (preset: string) => void;
  onApplyCustom: () => void;
  bounds: DateRange;
  sourceLabel?: string;
  refreshText?: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function DateWindow({
  range,
  preset,
  isOpen,
  onToggle,
  customRange,
  onCustomChange,
  onPreset,
  onApplyCustom,
  bounds,
}: Pick<
  SidebarProps,
  | "range"
  | "preset"
  | "customRange"
  | "onCustomChange"
  | "onPreset"
  | "onApplyCustom"
  | "bounds"
> & { isOpen: boolean; onToggle: () => void }) {
  const active = datePresets.find((p) => p.value === preset) ?? datePresets[0];
  const rangeText = range.since && range.until ? `${range.since} → ${range.until}` : "—";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{active.label}</span>
          <span className="block truncate tabular-nums">{rangeText}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="panel absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 space-y-1 p-2 shadow-[var(--shadow-elegant)]">
          {datePresets.map((p) => {
            const on = p.value === preset;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onPreset(p.value)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                  on ? "bg-brand-soft text-foreground" : "hover:bg-surface-2",
                )}
              >
                <Check
                  className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", on ? "text-brand" : "text-transparent")}
                />
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.description}</span>
                </span>
              </button>
            );
          })}

          {preset === "custom" ? (
            <div className="space-y-2 border-t border-border px-1 pt-3">
              <label className="block">
                <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                  Start
                </span>
                <Input
                  type="date"
                  value={customRange.since}
                  min={bounds.since || undefined}
                  max={customRange.until || bounds.until || undefined}
                  onChange={(e) => onCustomChange({ ...customRange, since: e.target.value })}
                  className="bg-surface-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                  End
                </span>
                <Input
                  type="date"
                  value={customRange.until}
                  min={customRange.since || bounds.since || undefined}
                  max={bounds.until || undefined}
                  onChange={(e) => onCustomChange({ ...customRange, until: e.target.value })}
                  className="bg-surface-2"
                />
              </label>
              <button
                type="button"
                onClick={onApplyCustom}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Apply range
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Controls(props: SidebarProps) {
  return (
    <>
      <Field label="Date window">
        <DateWindow
          range={props.range}
          preset={props.preset}
          isOpen={props.isDateOpen}
          onToggle={props.onToggleDate}
          customRange={props.customRange}
          onCustomChange={props.onCustomChange}
          onPreset={props.onPreset}
          onApplyCustom={props.onApplyCustom}
          bounds={props.bounds}
        />
      </Field>

      <Field label="Campaign / ad set">
        <Select value={props.selected} onValueChange={props.onSelected}>
          <SelectTrigger className="w-full bg-surface-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ad sets</SelectItem>
            {props.adSets.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Status">
        <Select value={props.statusFilter} onValueChange={props.onStatusFilter}>
          <SelectTrigger className="w-full bg-surface-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {props.statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Search">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            placeholder="Ad set or campaign"
            className="bg-surface-2 pl-9"
          />
        </div>
      </Field>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-7 border-r border-sidebar-border bg-sidebar px-6 py-7 lg:flex">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-lg font-bold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          Ş
        </div>
        <div>
          <p className="font-display text-base font-semibold leading-none">ShawQ</p>
          <p className="text-xs text-muted-foreground">Business Monitoring</p>
        </div>
      </div>

      <Controls {...props} />

      <div className="mt-auto rounded-xl border border-border bg-surface-2/60 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {props.sourceLabel ?? "Live workspace"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {props.refreshText ?? "Streaming live Shopify sales and Meta spend."}
        </p>
      </div>
    </aside>
  );
}

/** Mobile filter controls — rendered inside a `lg:hidden` disclosure in the app shell. */
export function MobileFilters(props: SidebarProps) {
  return (
    <div className="panel flex flex-col gap-5 p-5 lg:hidden">
      <Controls {...props} />
    </div>
  );
}
