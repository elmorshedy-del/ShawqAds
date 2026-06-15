# Known Issues and Technical Debt

**Last Updated:** 2026-06-15

---

## Product incidents (agent memory)

| Incident | What went wrong | Rule |
|----------|-----------------|------|
| KPI all-time highs (Jun 2026) | Ties counted as ATH; confetti on tie; records used full history while chart was launch-scoped | Intraday ATH requires strict `>`; confetti only on `strictBeat`; records `>= CAMPAIGN_LAUNCH_DATE` |
| Bundled App.jsx edits | Behavior/dwell PRs changed KPI projection, trend filters, polling | One concern per PR; stay in subsystem map |
| Merge without Gemini | Several PRs merged before Gemini review | Always poll `gemini-code-assist` before merge |
| Item count | Wrong merchandise count | Use `orderMerchandise.js` / `merchandiseItemCount()`; tips excluded |
| UAE/EU locations | Compound city strings mislabeled | `orderLocality.js`: fall back to province when city equals country |

Full detail: `AGENTS.md` Scope discipline, `memory/11-shawq-domain-map.md`.

## Scanner-Discovered Risks

| Finding | Reason |
|---------|--------|
| `src/components/dashboard/Sidebar.tsx`: TODO/FIXME markers | [INFERRED] Scanner marker |
| `src/components/ui/input.tsx`: TODO/FIXME markers | [INFERRED] Scanner marker |
| `src/components/ui/select.tsx`: TODO/FIXME markers | [INFERRED] Scanner marker |

## Test debt

- `npm run test:dashboard` — pre-existing failure on `BusinessMetricPanel` / `allBusinessRows` assertion (unrelated to recent feature work).

## Repository graph health

- First AMS graph build scored **F (21/100)** — expected for large mixed JS/TS monolith. Use `memory/11-shawq-domain-map.md` for feature lookup; graph for import/coupling questions.

## Unreadable Files

- None encountered during AMS init.
