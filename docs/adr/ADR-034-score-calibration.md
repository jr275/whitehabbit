# ADR-034: Score Calibration — real predicted-vs-actual bookkeeping, infrastructure for future model training

## Status
Accepted.

## Context
The Phase 6 brief explicitly separates two things that are easy to conflate: recording that a prediction turned out to be wrong (real, deterministic bookkeeping, achievable today) and building a trained model that learns from that (real machine learning, which needs real data volume this system does not have on day one — "Não invente machine learning sofisticado onde não existe dado suficiente"). `intelligence_outcomes` (ADR-033) gives a real measured result; nothing yet compared it against what a model predicted.

## Decision
`score_calibrations` (`migrations/0008`) and `lib/intelligence/score-calibration.ts`: `recordCalibration()` persists a real `{model, subjectType, subjectId, predictedValue, actualValue}` row and computes `delta = actualValue - predictedValue` server-side, never client-supplied. `model` is a closed union (`opportunity_score | information_gain | trend | quality_forecast`) — a calibration row always says exactly which real model it's judging. `summarizeCalibration()` computes real `meanAbsoluteError`/`meanSignedError` (bias direction) from whatever real rows exist for a model, and returns `null` — never a fabricated 0 — for a model with no real calibration data yet.

This is deliberately the full scope of ADR-034: no model retraining, no gradient descent, no fitted parameters. It is the ledger a real learning mechanism (ADR-035) reads from, and the ledger a future, genuinely-trained model would need as its training set once real volume exists.

## Consequences
- Positive: every prediction this system makes now has a real, inspectable path to being checked against what actually happened — the foundation enterprise trust in an "autonomous" system requires.
- Positive: `summarizeCalibration()`'s honest `null` (tested explicitly: `tests/integration/decision-layer.test.ts`'s "returns null (never a fabricated 0) for a model with no real data") means nothing downstream can mistake "no data yet" for "the model is perfectly calibrated."
- Negative: with low real sample counts (which every tenant starts at), `meanSignedError` is statistically noisy — ADR-035's `MIN_CALIBRATION_SAMPLES` floor exists specifically to keep that noise from ever reaching a real scoring decision.
