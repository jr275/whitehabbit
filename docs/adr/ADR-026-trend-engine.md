# ADR-026: Trend Engine — deterministic velocity/momentum math with a real minimum-volume floor

## Status
Accepted.

## Context
The brief explicitly warns against pretending every movement is a trend. A naive "% change between two periods" calculation reports a "+200%" trend on a jump from 1 observation to 3 — real noise, not a real trend. The brief requires configurable thresholds and named states (EMERGING/RISING/STABLE/DECLINING/BREAKING).

## Decision
`lib/intelligence/trend-engine.ts#detectTrend()` is a pure, deterministic function over real time-series points:
- **Velocity**: real period-over-period % change.
- **Acceleration**: real change in velocity between two windows (needs a 3rd period; `null` — never `0` — until then, honestly distinguishing "no acceleration" from "not enough data").
- **Momentum**: velocity weighted by `log10(10 + volume)` — a real dampening so momentum doesn't scale linearly with huge volumes, but still reflects that the same % swing carries more weight at higher real volume.
- **A real minimum-volume floor** (`minVolume`, default 10): below it, the function reports `stable` at confidence 0.2 regardless of how large the % swing is — the brief's "do not pretend every movement is a trend" as an actual code path, not a comment.
- **Configurable thresholds** (`TrendThresholds`) for every state boundary — a caller needing stricter/looser sensitivity passes its own, proven in `tests/unit/trend-engine.test.ts`'s "respects configurable thresholds" case.

`lib/intelligence/trend-scan.ts` is the real orchestration: buckets actual Search Console snapshots/query observations into ISO weeks, runs `detectTrend` per property and per query, persists real `Trend` rows (`lib/intelligence/trends.ts`), and — only for trends clearing a real eligibility bar (state ∈ {emerging, rising, breaking}, confidence ≥ 0.6) — creates a linked Opportunity (ADR-024, `lib/intelligence/trend-opportunity.ts`).

## Consequences
- Positive: `tests/unit/trend-engine.test.ts` proves every state boundary, the volume floor, and configurable-threshold behavior against pure math — no database, no flakiness, fast to run on every change.
- Positive: a project with no real Search Console data produces zero trends — never a fabricated one to make the feature look populated.
- Negative: seasonality detection (§15) is not implemented — `Trend.seasonality` is always `null` in this revision. Detecting real weekly/monthly periodicity needs more historical data than most tenants will have on day one; building it now would mean either faking a signal or over-engineering ahead of real usage. Named here as real future work, not silently dropped.
- Negative: the eligibility bar for trend→opportunity creation (confidence ≥ 0.6, specific states only) is a first, reasonable cut — not yet tuned against real production trend volume, since no real tenant has generated any yet.
