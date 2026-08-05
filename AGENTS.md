# ShawQ Ads — Cloud Agent Instructions

Cursor Cloud Agents read this file automatically. Follow it on every task.

## Pull request workflow

1. Branch from `main` using `cursor/<descriptive-name>-d573`.
2. Commit and push before testing; update the PR after each meaningful iteration.
3. Open a **draft** PR against `main` unless the user asks otherwise.
4. **Wait for Gemini Code Assist review before merging.** Do not merge until Gemini has commented on the PR.
5. Address actionable Gemini feedback (critical and medium first), push fixes, then merge.
6. If the user approves merge but Gemini has not reviewed yet, wait for Gemini — do not merge early.

### Gemini review gate (required every time)

After pushing a PR:

1. Check for a review from `gemini-code-assist` (from the PR branch):
   ```bash
   gh pr view --json reviews,comments
   PR_NUM=$(gh pr view --json number --jq .number)
   gh api repos/elmorshedy-del/ShawqAds/pulls/$PR_NUM/reviews
   gh api repos/elmorshedy-del/ShawqAds/pulls/$PR_NUM/comments
   ```
   Use `/reviews` for review summaries; use `/comments` for inline diff comments.
2. If no Gemini review yet, **keep polling autonomously** — do not ask the user to prompt again. Poll several times in the same session (e.g. 30–60s apart, up to 5 times max) before ending the turn. On the next session, poll again first if the PR is still open.
3. Read inline comments and the review summary; fix real bugs and worthwhile suggestions.
4. Push follow-up commits addressing feedback, then re-check that nothing new is blocking.
5. Only then: mark the PR ready (if draft) and merge.

**Never merge a PR without a Gemini review pass**, even for small UI-only changes.

When waiting for Gemini, report status briefly (e.g. “PR #22 open — polling for Gemini”) and continue polling yourself rather than asking the user to check back.

### What Gemini caught before (PR #18)

- **Critical:** Accidentally removed still-used imports (`DataTable`, `adapt`) — would crash at runtime.
- **Medium:** Redundant work in hot loops, unstable sort ties, overly narrow TypeScript prop types.

Treat Gemini comments as a required pre-merge checklist, not optional feedback.

## Git

- Push: `git push -u origin <branch-name>`
- Base branch for PRs: `main`
- Retry fetch/push on network errors (4s, 8s, 16s, 32s backoff)

## Scope discipline (learn from past mistakes)

**Do not bundle unrelated edits.** When fixing one subsystem, touch only the files and logic for that task. Unrelated changes hide regressions and waste review time.

### Incident: behavior/dwell fixes broke KPI all-time highs (Jun 2026)

- **User complaint:** “Why do your edits touch unrelated parts? All-time highs are acting weird.”
- **What went wrong:**
  - Behavior/dwell/location PRs bundled extra `App.jsx` changes (polling, date-range scoping, chart filters) that were not required for the stated fix.
  - PR #33 changed KPI tie logic so **ties** counted as all-time highs — intraday revenue/orders showed “still climbing” and fired confetti on a tie, not a new record.
  - KPI record detection used **full** Shopify history while the performance chart was scoped to `CAMPAIGN_LAUNCH_DATE` (`2026-06-03`), so badges could disagree with the chart.
- **Rules going forward:**
  1. **One concern per PR** — e.g. dwell UX changes stay in `dwellStats.js`, `pagePath.js`, `BehaviorAnalytics.tsx`; do not also edit KPI cards, `RevenueChart`, or global `App.jsx` wiring unless the user asks.
  2. **If `App.jsx` must change**, limit to the smallest hook/data line for that feature (e.g. `behaviorData` range only). Never refactor or “while I’m here” edit KPI projection, record badges, or trend chart filters in the same PR.
  3. **KPI all-time highs** (`src/lib/businessKpiInsights.js`):
     - Intraday ATH requires **strictly beating** prior max (`>`), not tying (`>=`).
     - Confetti/celebrate only on `strictBeat` (genuine new record).
     - Record rows should use the same launch window as the performance trend chart (`>= CAMPAIGN_LAUNCH_DATE`).
  4. **Before pushing**, scan the diff: if a file is unrelated to the task title, revert it or split into a separate PR.

### Incident: unwindowed fallback series reported the wrong period (Aug 2026)

- **Symptom:** a date window with no Meta rows showed real Meta spend, and the daily
  breakdown listed June dates under an August window with `0.00x` ROAS on every row.
- **Cause:** `filterMetaDataByDateRange` filtered every series *except* `daily_metrics`,
  which is the last fallback in the `accountDaily` chain. An empty window therefore fell
  through to full, unfiltered history.
- **Rule:** any series spread through `...meta` that is later used as a fallback must be
  date-filtered in the same function. Adding a new fallback source means adding a filter.

### Rule: never render an inference from absent data

Deltas, all-time-high/low badges and month projections were still drawn for windows with
no rows, producing "-100%" and an "All-time high" beside an `n/a` value. Gate them on
`windowHasData` (rows present) and `hasComparison` (a comparable prior window exists),
and name the actual record date rather than hardcoding "Yesterday".

### Subsystem map (stay in your lane)

| Task area | Primary files | Do not touch unless asked |
|-----------|---------------|---------------------------|
| Behavior / dwell | `dwellStats.js`, `pagePath.js`, `BehaviorAnalytics.tsx`, `fetch-behavior-intelligence.mjs` | `businessKpiInsights.js`, `KpiCard.tsx`, `RevenueChart.tsx` |
| KPI badges / projection | `businessKpiInsights.js`, `KpiCard.tsx`, `kpiRecord*` in `App.jsx` | Behavior rollups, dwell panels |
| Location labels | `orderLocality.js`, `orderResolver.mjs` | KPI logic, charts |
| Performance trend chart | `RevenueChart.tsx`, `trendDayRows` in `App.jsx` | Dwell stats, behavior polling |

## Cursor agent stack (loads every session)

**Primary workflow: phone + Cloud Agents** — no local desktop, no localhost services. Memory lives in **git**, not on your device.

### What loads automatically (phone / cloud — no setup)

| Layer | Location | Loads how |
|-------|----------|-----------|
| **Project instructions + lessons** | `AGENTS.md` | Cloud Agent reads every task |
| **Gemini review gate** | `.cursor/rules/gemini-review-gate.mdc` | `alwaysApply: true` — never merge without Gemini |
| **Karpathy guidelines** | `.cursor/rules/karpathy-guidelines.mdc` | `alwaysApply: true` |
| **Repo memory (AMS)** | `.cursor/rules/ams-memory.mdc` + `memory/` | `alwaysApply: true` — read before grepping |
| **Session memory behavior** | `.cursor/rules/agentmemory.mdc` | `alwaysApply: true` |
| **Skills reference** | `.cursor/skills/` | Available when relevant |

Cloud Agents clone `main` and get all of the above every session. **You do not need to run anything on your phone.**

### Persistent memory = git + optional Railway agentmemory

**Layer 1 — always in git (phone + cloud):**

1. **At session start** — read `memory/context-index.json`, then `memory/11-shawq-domain-map.md` and `AGENTS.md` Scope discipline before coding.
2. **After structural changes** — run `npm run memory:maintain` (and `memory:graph` if imports/routes changed); commit updated `memory/` in the same PR.
3. **After a non-obvious fix or user correction** — append a short lesson to Scope discipline in `AGENTS.md` (and `memory/08-known-issues-and-tech-debt.md` if it is a recurring incident).
4. **Do not** tell the user to run local terminal commands, install npm packages on their phone, or open localhost URLs.

**Layer 2 — optional cross-session recall ([agentmemory](https://github.com/rohitg00/agentmemory) on Railway):**

- Deploy as a **separate Railway service** — see `deploy/agentmemory/RAILWAY.md`.
- Set `AGENTMEMORY_URL` (HTTPS Railway URL) and `AGENTMEMORY_SECRET` in Cursor project MCP env.
- Cloud Agents use MCP `memory_smart_search` / `recall` when the server is reachable; otherwise fall back to `memory/` + `AGENTS.md`.

Follow Karpathy guidelines (surgical changes, simplicity first) on every task.

## Project notes

- Reporting timezone: `Europe/Istanbul`
- Production: https://shawq-ads-production.up.railway.app/
- **Historical insights tab** needs Shopify data from Feb 2026: set `SHOPIFY_BACKFILL_START_DATE=2026-02-01` on Railway (separate from Meta `BACKFILL_START_DATE=2026-06-03`). Server auto-re-runs Shopify fetch when cache `period.since` is still after February.
- Prefer minimal, focused diffs; match existing component patterns
- UI text fixes: wrap with `break-words` + `leading-snug` instead of `truncate` (see live monitor / email campaign / top movers)

## Deploy verification

After merging to `main`, Railway deploys automatically. Spot-check production when the change is user-visible.
