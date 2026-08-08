# Claude Code — start here

This repo already carries two force-loaded docs written for other agent tools. Read both
before making changes — don't duplicate their content here, this file just points to them:

1. **`AGENTS.md`** (repo root) — process rules: PR workflow, branch naming, the mandatory
   Gemini-review wait before merging, and a "Scope discipline" section with real incident
   postmortems worth reading before touching KPI/date-range code. Written for Cursor Cloud
   Agents but the rules apply regardless of which agent is making the change.
2. **`.claude/skills/shawqads-repo-guide/SKILL.md`** — architecture, file map, and a
   debugging playbook for this specific dashboard, built from a full first-pass exploration
   so you don't have to repeat it. Load it (the `Skill` tool) at the start of any bug fix,
   feature, or "what does X do" question in this repo — it's faster than re-grepping
   `src/App.jsx` (2500 lines) from scratch every session.

After a non-obvious fix or a lesson worth keeping: append it to the "Known issue history"
section of the skill (architecture/debugging lessons) or to `AGENTS.md`'s "Scope discipline"
section (process lessons). Both are living docs — the point is the next session starts ahead
of where this one started.
