---
id: AWP-EVAL-001
title: AI Evaluation Harness (golden sets per capability)
pillar: P8 Governance
phase: Development
roadmap_phase: 2
owning_agent: none
type: read-only
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: golden sets + AI capabilities under test, driven via AWP-AI-001
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-AI-001]
  relates_to: [AWP-ER-001, AWP-FCST-001, AWP-INTEL-014]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's AI quality gate, I want a golden-set evaluation harness that scores
every AI capability against labeled reference data — extraction accuracy, ER
precision/recall, summary faithfulness, forecast error vs. actuals — and **fails** any
model or prompt change that regresses a score beyond a threshold, while letting me
**shadow** a new model against production without touching production state, so that we
never ship "AI project health" we cannot measure and never silently degrade quality on
a prompt tweak.

## Context / Background
This packet is the **eval harness** that [`02`](../02-technical-foundation.md) §4
mandates under *Model evaluation* — "you can't ship 'AI project health' without
measuring it" — and that §5 (Phase 2) calls out to "stand up" alongside Tier-2 and
forecasting. It is the **regression gate** that protects every other AI capability:
extraction, entity resolution, summarization, and forecasting.

What it does (per [`02`](../02-technical-foundation.md) §4):
- Maintains a **golden set per capability** — labeled reference inputs with known-correct
  outputs (the ground truth) — and **scores** each capability against its golden set with
  a capability-appropriate metric:
  - **Extraction** → accuracy (predicted fields vs. labeled fields).
  - **Entity resolution** → **precision / recall** against labeled pairs
    ([`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) already treats
    precision/recall as a first-class per-tenant metric; this harness computes them
    against a fixed labeled golden set for regression gating).
  - **Summarization** → **faithfulness** as the **ratio of grounded tokens** (tokens
    traceable to the source vs. total) — directly enforcing the grounding rule
    [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) requires of its
    narrative.
  - **Forecasting** → **error vs. actuals** (predicted vs. realized outcomes) for
    [`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md).
- **Regression-gates** prompt/model changes: it runs on every change and compares each
  score to a stored **baseline**; a regression beyond `regression_threshold` is a
  **FAIL** (a named, machine-readable pass/fail observable — "regression-test
  prompts/models on every change", §4).
- Supports **shadow runs**: scoring a *new* model version against the same golden inputs
  **without affecting production** — no writes to, and no mutation of, production state
  ("shadow new models against production before cutover", §4).

Decisions an implementer must **not** re-derive:
- **The capabilities under test call Claude only through the gateway**
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — the harness *drives* those internal
  capabilities and the gateway; it holds no model API key itself. Hence
  `external_apis: []` and `sources: system internal`.
- **This packet is `read-only`:** it scores capabilities and persists *evaluation
  results* (its own internal records); it never writes back to an external SDLC tool and
  a shadow run never alters production. It therefore carries **no Guardrails block**
  ([`03`](../03-work-packet-format.md) §3, Rule 2).
- Scores are **persisted per capability + model_version** and are **queryable** so the
  per-tenant quality telemetry and human-feedback loop (§4) can trend them over time.

## Data Sources & External APIs
- **Golden sets** (`system: internal`): per-capability labeled fixtures at
  `golden_set_path` — `{capability, inputs, expected_output/labels}`. For ER, the labels
  are **labeled pairs** (match / non-match); for summarization, the source text the
  summary must be grounded in; for forecasting, the realized **actuals**.
- **AI capabilities under test** (`system: internal`): the extraction, ER
  ([`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md)), summarization
  ([`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)), and forecasting
  ([`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md)) capabilities — each invoked via
  the gateway [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md).
- **Baseline + results store** (`system: internal`): the harness reads the prior baseline
  score per `capability + model_version` and writes new scored results back to its own
  evaluation store (queryable). No external API key is held — `external_apis: []`.
- **Volumes / cost:** golden sets are intentionally small, fixed, and curated; an eval
  run is bounded by `|golden_set|`, not org scale.

## Inputs
- `golden_set_path` (required) — path/reference to the capability's golden set
  (labeled reference data).
- `capability` (required) — which capability to score:
  `extraction | entity_resolution | summarization | forecasting`.
- `model_version` (required) — the model/prompt version under test; recorded with the
  result and used as the baseline key.
- `regression_threshold` (default `0.05`) — the maximum tolerated **drop** in a
  capability's primary score versus its baseline; a larger drop FAILS the check.
- `mode` (default `gate`) — `gate` compares to baseline and emits pass/fail;
  `shadow` scores a new `model_version` against the golden inputs **without** writing to
  or mutating production state.
- `baseline_version` (default = the current production `model_version` for the
  capability) — the version whose stored score the run is compared against.
- Secrets by reference: read-scoped evaluation-store credentials only; **no** model/API
  keys (the gateway holds those).
- Trigger: a prompt/model change (regression gate in CI), a scheduled re-eval, or an
  on-demand shadow run for a candidate `model_version`.

## Outputs / Artifacts
- A **scored result** record per run:
  `{capability, model_version, mode, metric_name, score, baseline_score, delta,
  passed, run_at, golden_set_ref}` persisted to the evaluation store, **queryable** by
  `capability` + `model_version`.
- **Per-capability metric fields:**
  - extraction → `accuracy` (0–1).
  - entity_resolution → `precision` and `recall` (each 0–1), computed against the
    labeled pairs, **reported as numbers**.
  - summarization → `faithfulness` = grounded-token ratio (0–1).
  - forecasting → `forecast_error` vs. actuals (and its derived pass score).
- A named **regression verdict** `passed ∈ {true, false}` — `false` (FAIL) when
  `baseline_score − score > regression_threshold`.
- A named **shadow isolation observable** for shadow runs:
  `production_writes == 0` and `production_state_mutated == false` (the run scored the
  new model without touching production).
- **Trend-queryable history:** results retained per `capability + model_version` so
  scores can be charted over time (quality telemetry, §4).

## Acceptance Criteria

Scenario: Running the harness on a capability produces a scored result against its golden set
  Given a `golden_set_path` for `capability`
    And a `model_version` under test
  When the harness runs in `mode` = "gate"
  Then a scored result record is produced for that `capability` + `model_version`
    And it contains a numeric `score` in [0, 1] and the `golden_set_ref` it was scored against.

Scenario: A regression beyond regression_threshold FAILS the check
  Given a baseline `score` for `capability` of B for `baseline_version`
    And `regression_threshold` = 0.05
    And the new run's `score` S satisfies (B − S) > 0.05
  When the harness compares the run to the baseline
  Then the result's `passed` field = false (a named pass/fail observable)
    And `delta` = (S − B) is reported as a negative number exceeding the threshold in magnitude.

Scenario: A non-regressing change PASSES the check
  Given a baseline `score` B for `capability`
    And `regression_threshold` = 0.05
    And the new run's `score` S satisfies (B − S) ≤ 0.05
  When the harness compares the run to the baseline
  Then the result's `passed` field = true.

Scenario: ER precision and recall are computed against labeled pairs and reported as numbers
  Given the `entity_resolution` golden set of labeled match / non-match pairs
  When the harness scores the ER capability
  Then the result reports `precision` and `recall` each as a number in [0, 1]
    And `precision` = TP / (TP + FP) and `recall` = TP / (TP + FN) over the labeled pairs.

Scenario: Summary faithfulness is scored as the ratio of grounded tokens
  Given the `summarization` golden set with source text per summary
  When the harness scores the summarization capability
  Then the result reports `faithfulness` = (count of grounded tokens) / (count of total tokens)
    And `faithfulness` is in [0, 1].

Scenario: A shadow run scores a new model version without writing to or altering production
  Given `mode` = "shadow" and a candidate `model_version`
  When the harness scores that version against the golden inputs
  Then a scored result for the candidate `model_version` is produced
    And the run's named isolation observable holds: `production_writes` == 0
        AND `production_state_mutated` == false.

Scenario: Results are persisted per capability + model_version and are queryable
  Given a completed eval run for (`capability`, `model_version`)
  When the evaluation store is queried by that `capability` + `model_version`
  Then exactly the persisted result(s) for that pair are returned
    And each carries its `score`, `metric_name`, `passed`, and `run_at`.

## Out of Scope
- Owning Claude/embedding infrastructure, model routing, or token budgets — provided by
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md); the harness *drives* it.
- Implementing the capabilities themselves (extraction, ER, summarization, forecasting) —
  those are their own packets
  ([`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md),
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md),
  [`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md)); the harness only **scores** them.
- **Cutting over** the production model to a new version — the harness *informs* a cutover
  decision (shadow + gate); the actual model promotion is a separate operational action.
- Curating or labeling the golden sets (a data/annotation task); the harness consumes
  `golden_set_path` as given.
- Any write-back to a source tool, and any mutation of production state during a shadow run.

## Dependencies / Linked Packets
- **depends_on** [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — every capability the
  harness scores invokes Claude through the gateway; the gateway is also where shadow
  model routing is exercised.
- **relates_to** [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) — supplies the
  ER precision/recall definition the harness computes on a labeled golden set;
  [`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md) — the forecasting capability whose
  error-vs-actuals the harness scores;
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) — the grounded narrative
  whose faithfulness (grounded-token ratio) the harness scores.

## Non-Functional Requirements
- **Performance:** an eval run is bounded by `|golden_set|` (small, curated), not org
  scale; a gate run completes fast enough to sit in CI on every prompt/model change.
- **Security/Privacy:** golden sets and results are tenant/governance-scoped;
  read-scoped evaluation-store credentials; no model keys held here; PII in golden data
  follows the same redaction policy ([`02`](../02-technical-foundation.md) §4).
- **Idempotency/Reliability:** scoring a fixed `model_version` against a fixed golden set
  is **deterministic** for deterministic metrics (re-runs yield the same score on frozen
  inputs); a shadow run is **fully isolated** — it can never write to or mutate
  production state (the named isolation observable).
- **Observability:** every run emits `{capability, model_version, mode, score, baseline,
  delta, passed}`; results are retained and queryable to trend per-capability quality
  over time and feed the human-feedback loop ([`02`](../02-technical-foundation.md) §4).
- **Cost:** capability calls go through the gateway under its budgets; golden sets are
  deliberately small to keep regression-gating cheap enough to run on every change.

## Verification / Test Notes
- **Fixtures:** `fixtures/golden_extraction.json`, `fixtures/golden_er_pairs.json`
  (labeled match/non-match pairs), `fixtures/golden_summaries.json` (summary + source
  text for grounded-token scoring), `fixtures/golden_forecast_actuals.json`
  (predictions + realized actuals), and a stored baseline per capability.
- **Scored-result AC:** run `mode=gate` on a capability fixture with a stubbed gateway;
  assert a result record with numeric `score` ∈ [0,1] and the `golden_set_ref`.
- **Regression-FAIL AC:** seed a baseline B; feed a `model_version` whose score S makes
  (B − S) > `regression_threshold`; assert `passed` == false and `delta` < 0.
- **Non-regression-PASS AC:** feed a score within threshold; assert `passed` == true.
- **ER metrics AC:** run the ER scorer on the labeled-pairs fixture; assert numeric
  `precision` = TP/(TP+FP) and `recall` = TP/(TP+FN).
- **Faithfulness AC:** run the summarization scorer; assert `faithfulness` ==
  grounded_tokens / total_tokens and is in [0,1].
- **Shadow-isolation AC:** run `mode=shadow` with a production-state spy; assert a scored
  result is produced for the candidate version AND `production_writes` == 0 AND
  `production_state_mutated` == false.
- **Persistence/query AC:** after a run, query the store by `capability` + `model_version`
  and assert exactly the persisted result(s) are returned with `score`/`passed`/`run_at`.

## Open Questions
- *(none — packet is `ready`)*
