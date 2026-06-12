import { Fragment, useMemo, useState } from "react";
import { ChevronRight, GitBranch, TriangleAlert } from "lucide-react";
import {
  fmtCurrency,
  fmtPct,
  type AdSetNode,
  type CampaignNode,
} from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type SortKey = "spend" | "ctr" | "shopifyRoas" | "mappedRoas" | "shopify";
const sorts: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "ctr", label: "CTR" },
  { key: "shopify", label: "Shopify sales" },
  { key: "shopifyRoas", label: "Shopify ROAS" },
  { key: "mappedRoas", label: "Mapped ROAS" },
];

function roasClass(v: number) {
  if (v >= 3) return "text-positive";
  if (v >= 1.5) return "text-gold";
  if (v > 0) return "text-destructive";
  return "text-muted-foreground";
}

function Metric({ value, className, sub }: { value: string; className?: string; sub?: string }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums">
      <span className={cn("font-medium", className)}>{value}</span>
      {sub && <span className="block text-[0.6rem] text-muted-foreground">{sub}</span>}
    </td>
  );
}

function NodeRow({
  node,
  depth,
  maxSpend,
  expanded,
  onToggle,
}: {
  node: CampaignNode | AdSetNode;
  depth: 0 | 1 | 2;
  maxSpend: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const kids = (node as AdSetNode).children;
  const hasChildren = !!kids && kids.length > 0;
  const warn = node.flag === "warning";
  const indent = depth === 2 ? "pl-12" : depth === 1 ? "pl-6" : "";
  const barIndent = depth === 2 ? "ml-12" : depth === 1 ? "ml-6" : "";
  const sub = hasChildren
    ? `${kids!.length} ${depth === 0 ? "ad set" : "ad"}${kids!.length === 1 ? "" : "s"}`
    : (node as AdSetNode).category || "";

  return (
    <tr
      className={cn(
        "group border-t border-border/70 transition-colors",
        depth === 0 ? "hover:bg-surface-2/60" : depth === 1 ? "bg-surface-2/40" : "bg-surface-2/20",
      )}
    >
      <td className="py-3 pl-4 pr-3">
        <button
          onClick={onToggle}
          disabled={!hasChildren}
          className={cn("flex items-center gap-2 text-left", indent, !hasChildren && "cursor-default")}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90 text-primary",
              )}
            />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                depth === 0 ? "bg-primary/40" : "bg-border",
              )}
            />
          )}
          <span className="flex flex-col">
            <span
              className={cn(
                "font-medium leading-tight",
                depth === 0 ? "text-sm" : depth === 1 ? "text-xs" : "text-xs text-muted-foreground",
              )}
            >
              {node.name}
            </span>
            {(sub || warn) && (
              <span className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                {warn && <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" />}
                {sub}
              </span>
            )}
          </span>
        </button>
        {/* spend bar */}
        <div className={cn("mt-2 h-1 overflow-hidden rounded-full bg-surface-2", barIndent)}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(node.spend / maxSpend) * 100}%`, background: "var(--gradient-primary)" }}
          />
        </div>
      </td>
      <Metric value={fmtCurrency(node.spend)} />
      <Metric value={fmtPct(node.ctr)} className="text-muted-foreground" />
      <Metric value={`${node.atc}`} className="text-muted-foreground" />
      <Metric value={`${node.ic}`} className="text-muted-foreground" />
      <Metric value={`${node.metaSales}`} className="text-muted-foreground" sub="meta" />
      <Metric value={`${node.shopify}`} sub="direct" />
      <Metric value={`${node.mapped}`} sub="mapped" />
      <Metric value={`${node.metaRoas.toFixed(2)}x`} className="text-muted-foreground" />
      <Metric value={`${node.shopifyRoas.toFixed(2)}x`} className={roasClass(node.shopifyRoas)} />
      <Metric value={`${node.mappedRoas.toFixed(2)}x`} className={cn("pr-4", roasClass(node.mappedRoas))} />
    </tr>
  );
}

const headers = ["Spend", "CTR", "ATC", "IC", "Meta", "Shopify", "Mapped", "Meta ROAS", "Shopify ROAS", "Mapped ROAS"];

export function CampaignRoasTree({ data }: { data: CampaignNode[] }) {
  const [sort, setSort] = useState<SortKey>("spend");
  const [open, setOpen] = useState<Record<string, boolean>>({ USA_CBO: true });

  const ordered = useMemo(
    () => [...data].sort((a, b) => (b[sort] as number) - (a[sort] as number)),
    [data, sort],
  );
  const maxSpend = Math.max(...data.map((c) => c.spend), 1);
  const warnings = data.filter((c) => c.flag === "warning").length;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <GitBranch className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Campaign Shopify ROAS tree</h2>
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            {data.length} campaigns · expand a campaign to its ad sets, then an ad set to its ads. Shopify revenue
            is assigned directly or by country ownership; product matches flow into mapped ROAS.
          </p>
        </div>
        <div className="inline-flex flex-wrap gap-1 self-start rounded-full border border-border bg-surface-2 p-1">
          {sorts.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                sort === s.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {warnings > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-6 py-2.5 text-xs text-destructive">
          <TriangleAlert className="h-3.5 w-3.5" />
          {warnings} row{warnings > 1 ? "s" : ""} where Meta sales exceed Shopify-mapped sales — expand before trusting mapped ROAS.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="py-3 pl-4 pr-3 text-left font-medium">Campaign / ad set</th>
              {headers.map((h) => (
                <th key={h} className="px-3 py-3 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((c) => {
              const cOpen = !!open[c.name];
              return (
                <Fragment key={c.name}>
                  <NodeRow
                    node={c}
                    depth={0}
                    maxSpend={maxSpend}
                    expanded={cOpen}
                    onToggle={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}
                  />
                  {cOpen &&
                    (c.children || []).map((ch) => {
                      const akey = `${c.name}/${ch.name}`;
                      const aOpen = !!open[akey];
                      const ads = ch.children || [];
                      return (
                        <Fragment key={akey}>
                          <NodeRow
                            node={ch}
                            depth={1}
                            maxSpend={maxSpend}
                            expanded={aOpen}
                            onToggle={
                              ads.length
                                ? () => setOpen((o) => ({ ...o, [akey]: !o[akey] }))
                                : undefined
                            }
                          />
                          {aOpen &&
                            ads.map((ad) => (
                              <NodeRow
                                key={`${akey}/${ad.name}`}
                                node={ad}
                                depth={2}
                                maxSpend={maxSpend}
                              />
                            ))}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
