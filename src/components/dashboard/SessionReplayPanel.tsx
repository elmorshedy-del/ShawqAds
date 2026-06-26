import { useEffect, useMemo, useRef, useState } from "react";
import { CheckoutTheater } from "@/components/dashboard/CheckoutTheater";
import { Film, PlayCircle, RefreshCw, Video, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { pagePathLabel } from "@/lib/pagePath";

interface ReplaySessionRow {
  session_key: string;
  session_id?: string;
  country_code?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  has_replay?: boolean;
  replay_events?: number;
  checkout_outcome?: string;
  checkout_steps?: number;
  last_path?: string;
}

interface ReplayTimelineRow {
  event_name: string;
  timestamp: string;
  path?: string;
  country_code?: string;
}

interface ReplayPayload {
  session_key: string;
  session_id?: string;
  has_replay?: boolean;
  replay_events?: number;
  checkout_outcome?: string;
  checkout_outcome_label?: string;
  checkout_timeline?: ReplayTimelineRow[];
  checkout_theater?: {
    frames?: any[];
    reached_steps?: string[];
    last_step_id?: string;
    duration_ms?: number;
    outcome?: string;
  };
  events?: any[];
}

function countryFlag(code?: string) {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "•";
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function outcomeTone(outcome?: string) {
  switch (outcome) {
    case "completed":
      return "bg-positive/10 text-positive";
    case "payment_abandoned":
    case "checkout_abandoned":
      return "bg-gold/10 text-gold";
    default:
      return "bg-surface-2 text-muted-foreground";
  }
}

function formatEventName(name = "") {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWhen(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReplayPlayer({ events }: { events: any[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || !events.length) return undefined;

    let player: { $destroy?: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const [{ default: rrwebPlayer }] = await Promise.all([
        import("rrweb-player"),
        import("rrweb-player/dist/style.css"),
      ]);
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      player = new rrwebPlayer({
        target: containerRef.current,
        props: {
          events,
          width: Math.min(containerRef.current.clientWidth || 960, 960),
          height: 540,
          autoPlay: false,
          showController: true,
          speed: 1,
        },
      });
    })().catch(() => {});

    return () => {
      cancelled = true;
      player?.$destroy?.();
      if (target) target.innerHTML = "";
    };
  }, [events]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black/90">
      <div ref={containerRef} className="min-h-[320px] w-full" />
    </div>
  );
}

function CheckoutTimeline({ rows }: { rows: ReplayTimelineRow[] }) {
  if (!rows.length) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        No checkout timeline yet. Install the Customer Events pixel to capture checkout steps on hosted checkout.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div
          key={`${row.event_name}-${row.timestamp}-${index}`}
          className="flex items-start gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[0.65rem] font-semibold text-brand">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{formatEventName(row.event_name)}</p>
            <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
              {formatWhen(row.timestamp)}
              {row.path ? ` · ${pagePathLabel(row.path)}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SessionReplayPanel() {
  const [sessions, setSessions] = useState<ReplaySessionRow[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [status, setStatus] = useState<{ configured?: boolean; checkout_sessions?: number } | null>(null);
  const [recorderStatus, setRecorderStatus] = useState<{ installed?: boolean; hosted_src?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedSession = useMemo(
    () => sessions.find((row) => row.session_key === selectedKey) || null,
    [sessions, selectedKey],
  );

  async function loadIndex() {
    setLoading(true);
    setError("");
    try {
      const [indexRes, statusRes, recorderRes] = await Promise.all([
        fetch("/api/session-replay/index?limit=20", { cache: "no-store" }),
        fetch("/api/session-replay/status", { cache: "no-store" }),
        fetch("/api/shopify/recorder/status", { cache: "no-store" }),
      ]);
      const indexJson = await indexRes.json();
      const statusJson = await statusRes.json();
      const recorderJson = await recorderRes.json();
      if (!indexRes.ok) throw new Error(indexJson.error || "Could not load replay sessions");
      const rows = Array.isArray(indexJson.sessions) ? indexJson.sessions : [];
      setSessions(rows);
      setStatus(statusJson);
      setRecorderStatus(recorderJson);
      if (!selectedKey && rows[0]?.session_key) setSelectedKey(rows[0].session_key);
    } catch (loadError: any) {
      setError(loadError.message || "Could not load checkout replays");
    } finally {
      setLoading(false);
    }
  }

  async function loadSession(sessionKey: string, sessionId?: string) {
    if (!sessionKey) return;
    setDetailLoading(true);
    setError("");
    try {
      const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const res = await fetch(`/api/session-replay/${sessionKey}${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load session replay");
      setPayload(json);
    } catch (loadError: any) {
      setError(loadError.message || "Could not load session replay");
      setPayload(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadIndex();
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    const sessionId = selectedSession?.session_id;
    loadSession(selectedKey, sessionId);
  }, [selectedKey, selectedSession?.session_id]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold">Checkout session replay</p>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Clarity-style replays for cart and storefront checkout pages, paired with hosted-checkout step timelines from the Customer Events pixel.
          </p>
        </div>
        <button
          type="button"
          onClick={loadIndex}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Auto setup:</span> ShawQ can inject the storefront recorder via Shopify ScriptTag at{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">/shopify/session-recorder.js</code> when the Admin token has{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">write_script_tags</code>. The Customer Events pixel still installs manually in Shopify Admin.
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <Wrench className="h-3.5 w-3.5" />
          Recorder script tag:{" "}
          {recorderStatus?.installed ? (
            <span className="font-medium text-positive">installed</span>
          ) : (
            <span className="font-medium text-gold">not detected — run npm run install:shopify-recorder</span>
          )}
          {recorderStatus?.hosted_src ? (
            <span className="break-all text-[0.65rem]">{recorderStatus.hosted_src}</span>
          ) : null}
        </p>
        <p className="mt-1">
          Hosted checkout (<code className="rounded bg-surface-2 px-1 py-0.5">checkout.shopify.com</code>) cannot be DOM-recorded from theme or custom pixels. Clarity/Fullstory use Shopify&apos;s Advanced DOM app scope (Plus). ShawQ replays those steps via the pixel journey theater below; full checkout DOM requires the Partner app path in <code className="rounded bg-surface-2 px-1 py-0.5">extensions/shawq-advanced-dom-pixel/</code>.
        </p>
        {status ? (
          <p className="mt-1">
            Replay index: {status.configured ? `${status.checkout_sessions || 0} checkout sessions indexed` : "waiting for first replay chunk"}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Recent checkout sessions</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading sessions…</p>
          ) : sessions.length ? (
            <div className="space-y-2">
              {sessions.map((row) => (
                <button
                  key={row.session_key}
                  type="button"
                  onClick={() => setSelectedKey(row.session_key)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    selectedKey === row.session_key
                      ? "border-brand bg-brand-soft/40"
                      : "border-border bg-surface hover:bg-surface-2/70",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{countryFlag(row.country_code)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.6rem] font-medium", outcomeTone(row.checkout_outcome))}>
                      {row.checkout_outcome?.replace(/_/g, " ") || "session"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs font-medium">
                    {row.has_replay ? "Replay + timeline" : "Timeline only"}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {formatWhen(row.last_seen_at)} · {row.checkout_steps || 0} checkout steps
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No checkout sessions yet. After the theme recorder and pixel are live, abandoned and completed checkout sessions will appear here.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {detailLoading ? (
            <p className="text-xs text-muted-foreground">Loading replay…</p>
          ) : payload ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-medium", outcomeTone(payload.checkout_outcome))}>
                  {payload.checkout_outcome_label || payload.checkout_outcome || "Session"}
                </span>
                {payload.has_replay ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.65rem] font-medium text-brand">
                    <Film className="h-3 w-3" />
                    {payload.replay_events || 0} replay frames
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                    <PlayCircle className="h-3 w-3" />
                    Timeline only (hosted checkout)
                  </span>
                )}
              </div>

              {payload.has_replay && payload.events?.length ? (
                <ReplayPlayer events={payload.events} />
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
                  <p className="text-sm font-medium">No storefront replay for this session</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The visitor may have entered checkout directly on Shopify-hosted checkout, where theme recording cannot run. Use the step timeline below.
                  </p>
                </div>
              )}

              <CheckoutTheater theater={payload.checkout_theater} />

              <div>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Raw checkout step timeline
                </p>
                <CheckoutTimeline rows={payload.checkout_timeline || []} />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Select a session to watch the replay.</p>
          )}
        </div>
      </div>
    </div>
  );
}
