# ADR-035: Closing the Learning Loop — Action → Outcome → Score Calibration → Score Adjustment, deterministic and bounded

## Status
Accepted.

## Context
Score Calibration (ADR-034) records the real gap between what a model predicted and what actually happened, but recording that gap and never acting on it is only half the "learning loop" the Phase 6 brief describes: "Action→Outcome→Measurement→Learning Signal→Score Adjustment, feeding back into Opportunity Score/Information Gain/Trend/Quality Forecast models." The brief is equally explicit about the failure mode to avoid: inventing a sophisticated learning mechanism the system's real data volume can't support.

## Decision
`lib/intelligence/learning-loop.ts`:
- `computeScoreAdjustment(orgId, projectId, model)` derives a real, bounded bias correction from `summarizeCalibration()`'s `meanSignedError`, capped at `MAX_ADJUSTMENT_MAGNITUDE` (15 score points) — a real, gradual nudge, never a wild swing from one skewed batch. Below `MIN_CALIBRATION_SAMPLES` (5) real calibration rows, it returns `null` — a true no-op, not a low-confidence guess.
- `applyScoreAdjustment(result, adjustment)` is pure: a `null` adjustment returns the exact same result object unchanged; a real adjustment nudges the score, clamps it back into `[0,100]`, and appends the real, human-readable reason to `evidence[]` — the gate's decision stays explainable, never a silent score change.
- Wired into the one real blocking decision this most directly informs today: the Information Gain V2 gate (ADR-031), both the real content-generation pipeline step and the on-demand `GET .../information-gain` endpoint. Opportunity V1 discovery-time scoring (ADR-027) is untouched — this loop closes around the one score that actually gates page creation.

No machine learning is claimed or implemented. This is deterministic bookkeeping over real predicted-vs-actual deltas, exactly the posture the brief asks for: "no começo pode ser deterministic learning/calibration."

## Consequences
- Positive: a fresh tenant's scoring is byte-for-byte identical to the unadjusted model until real outcome data exists to justify a correction — zero regression risk, verified against the full test suite and the E2E vertical slice.
- Positive: the correction is bounded and explainable at every step — a reviewer can always see exactly why a score moved and by how much.
- Negative: this closes the loop for exactly one model (`information_gain`) in exactly one real call path. Wiring the same mechanism into Opportunity Score/Trend/Quality Forecast scoring is real, structurally identical follow-up work, not done here — deliberately scoped down rather than touching four scoring paths at once this phase.
- Negative: `MIN_CALIBRATION_SAMPLES = 5` and `MAX_ADJUSTMENT_MAGNITUDE = 15` are reasoned defaults, not derived from real production data (none exists yet) — real candidates for revision once real outcome volume accumulates.
