# System Architecture

**Last Updated:** 2026-06-15

---

## Architecture Summary

This is an inferred architecture document. Treat sections marked `[INFERRED]`, `[PLANNED]`, or `[INCOMPLETE]` as prompts for verification before making architectural changes.

## Runtime Shape

- Project profile: `mixed`
- Detected profiles: `cli-package`, `frontend`, `mixed`
- Frameworks: React

## Mermaid Sketch

```mermaid
flowchart LR
    Contributor["Human or AI contributor"] --> Repo["workspace"]
    Repo --> Source["Source files"]
    Repo --> Config["Configuration"]
    Repo --> Tests["Validation commands"]
    Repo --> Memory["/memory context layer"]
```

## Deployment Hints

- `README.md`
- `src/components/dashboard/BehaviorAnalytics.tsx`
- `src/components/dashboard/DailyDelivery.tsx`
- `src/components/dashboard/OrdersMap.tsx`
- `src/components/dashboard/Sidebar.tsx`
- `src/main.jsx`

## Open Architecture Questions

- [INCOMPLETE] Confirm service boundaries and runtime communication paths with maintainers.
- [INCOMPLETE] Add diagrams for deployed infrastructure once verified.
