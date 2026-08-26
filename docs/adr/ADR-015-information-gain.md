# ADR-015: Information Gain is a named, currently-unscored component — never a guessed number

## Status
Accepted.

## Context
§19 requires an `InformationGainService` that gates generation entirely:
pages below threshold must never be generated, only merged/enriched/
rejected. This is one of the eight-plus score components the Opportunity
Engine (ADR-006) is structured to hold, and it is one of the components with
no real signal available yet — computing it needs the actual candidate page
content plus a comparison against what already exists (competitor pages,
the tenant's own site), neither of which exists as a capability in this
revision (no crawler, no page generation).

## Decision
`opportunities.information_gain_score` is a real column, always `NULL` in
this revision (per ADR-005's provenance rule: absence over invention), and
the Opportunity API/UI must render it as "not yet scored," never default it
to a passing or failing number. The gate itself — "DO NOT GENERATE below
threshold" — cannot be enforced yet because there is no generation step to
gate (ADR-006/ADR-007 are pre-Page-Engine). This ADR exists so that
whichever future change adds page generation is required to read this
column and *refuse to proceed* when it's `NULL`, not just when it's low —
an ungated generation path would violate §19 even if a real
`InformationGainService` is built later, if the generation code doesn't
actually check it.

## Consequences
- Positive: the eventual `InformationGainService` has an exact, pre-agreed
  landing spot (`information_gain_score`) and an exact, pre-agreed
  enforcement point (the not-yet-built generation step must treat `NULL`
  as "blocked," same as a real low score) — this is written down now so it
  isn't skipped under future time pressure.
- Negative: none of the Opportunities created by this revision can be
  auto-generated into pages, by design — every one requires a human
  decision informed by the components that *do* exist (source grounding,
  outline completeness, confidence) plus their own judgment, until
  Information Gain scoring is real.
