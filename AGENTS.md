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

1. Check for a review from `gemini-code-assist`:
   ```bash
   gh pr view <number> --json reviews,comments
   gh api repos/elmorshedy-del/ShawqAds/pulls/<number>/reviews
   gh api repos/elmorshedy-del/ShawqAds/pulls/<number>/comments
   ```
   Use `/reviews` for review summaries; use `/comments` for inline diff comments.
2. If no Gemini review yet, poll again before merging (do not skip this step).
3. Read inline comments and the review summary; fix real bugs and worthwhile suggestions.
4. Push follow-up commits addressing feedback, then re-check that nothing new is blocking.
5. Only then: mark the PR ready (if draft) and merge.

**Never merge a PR without a Gemini review pass**, even for small UI-only changes.

### What Gemini caught before (PR #18)

- **Critical:** Accidentally removed still-used imports (`DataTable`, `adapt`) — would crash at runtime.
- **Medium:** Redundant work in hot loops, unstable sort ties, overly narrow TypeScript prop types.

Treat Gemini comments as a required pre-merge checklist, not optional feedback.

## Git

- Push: `git push -u origin <branch-name>`
- Base branch for PRs: `main`
- Retry fetch/push on network errors (4s, 8s, 16s, 32s backoff)

## Project notes

- Reporting timezone: `Europe/Istanbul`
- Production: https://shawq-ads-production.up.railway.app/
- Prefer minimal, focused diffs; match existing component patterns
- UI text fixes: wrap with `break-words` + `leading-snug` instead of `truncate` (see live monitor / email campaign / top movers)

## Deploy verification

After merging to `main`, Railway deploys automatically. Spot-check production when the change is user-visible.
