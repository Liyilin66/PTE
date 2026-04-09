# PRD - WE AI Scoring Phase 1

Date: 2026-04-07
Workspace: D:\PTE\kai-kou
Mode: $plan (direct)

## 1) Requirements Summary

Goal: deliver WE (Write Essay) AI scoring Phase 1 with official-public PTE trait alignment, without complex UI/history/long-form correction.

Hard constraints:
- Keep WFD stable chain unchanged.
- Do not modify question-audio/wfd/*.
- Avoid large RA flow changes.
- WE output must be clearly marked estimated / AI review.
- Follow official-public WE traits and gate/form rules.

Target trait scores:
- Content: 0-6
- Form: 0-2
- Development, Structure and Coherence: 0-6
- Grammar: 0-2
- General Linguistic Range: 0-6
- Vocabulary Range: 0-2
- Spelling: 0-2
- raw_total = 26
- overall_estimated = round(raw_total / 26 * 90)

Form rules (official-public constraints to enforce in rule layer):
- 2: 200-300 words
- 1: 120-199 OR 301-380
- 0: <120 OR >380 OR all-uppercase OR almost no punctuation OR mostly bullet points / very short sentences

Gate rules:
- If Content = 0 OR Form = 0 => not scored
- In gate state, do not continue normal scoring display for remaining traits
- Frontend shows Not scored / Needs rewrite

## 2) Codebase Facts (grounded)

Current unified score entry:
- api/score.js (POST /api/score) handles auth, access, prompt building, model call, parse/normalize, response.

Current LLM routing:
- backend/llm/score-llm-service.js uses Gemini primary then Groq fallback.
- backend/llm/providers/gemini.js and backend/llm/providers/groq.js implement provider calls and timeout/error normalization.

Frontend score caller:
- src/stores/practice.js action submitScore(taskType, transcript, questionContent, questionId) posts to /api/score and stores result.

WE status:
- src/views/WEView.vue submitEssay currently only local toast (no AI scoring yet).

Routing:
- src/router/index.js has /we and /we/practice/:id but no dedicated WE result route.

## 3) Phase 1 Task Breakdown

### A. Backend WE scoring contract and rule engine
1. Add WE branch in score handler with strict, isolated logic path.
2. Add deterministic form+gate precheck utility.
3. Define WE prompt schema and strict JSON response target for model.
4. Add WE normalization utility:
   - clamp trait ranges
   - recompute raw_total and overall_estimated on server (source of truth)
   - enforce gate override output
5. Return explicit metadata:
   - estimated flag
   - review_label
   - gate reason(s)
   - provider_used/fallback_reason

### B. Frontend result-card data wiring (minimal UI)
1. Connect WE submit button to existing submitScore chain using taskType WE.
2. Add WE in-page result card block (no complex page/history):
   - overall estimated
   - raw_total/26
   - trait rows
   - Not scored / Needs rewrite gate state
   - clear Estimated / AI review badge
3. Keep existing WE writing UI intact; no large redesign.

### C. Logging and persistence (lightweight)
1. Preserve existing practice_logs insertion path.
2. Extend score_json payload for WE only to store trait map + gate metadata.
3. Do not alter RA audio upload path.

### D. Verification and rollout
1. Rule-layer unit-style checks (form bins and gate).
2. API response shape checks for scored and gated essays.
3. Manual smoke in /we using sample essays across word-count bands.

## 4) Proposed Files to Change

### Must change
- api/score.js
  - Add WE-specific prompt builder branch, parser, normalizer, gate enforcement branch.
  - Keep RA code path untouched.
- src/stores/practice.js
  - Extend normalizeScoreData/buildPracticeLogScoreJson for WE response shape.
  - No change to RA/WFD behavior.
- src/views/WEView.vue
  - Replace local toast-only submit with actual scoring call.
  - Add simple result card section (no new history page).

### Recommended new backend helper files (to reduce risk in api/score.js)
- backend/we/form-gate-rules.js
  - word count, all caps check, punctuation density, bullet-like density, short-sentence ratio.
- backend/we/normalize-we-score.js
  - clamp trait ranges, recompute totals, apply content/form gate.
- backend/we/we-prompt.js
  - model prompt and target JSON template for WE.

### Optional docs update
- docs/we-phase1-data-contract.md
  - Add a short section linking to WE scoring Phase 1 contract and gate behavior.

## 5) Backend API Design

Keep endpoint unified to minimize risk:
- POST /api/score

Request (WE):
- taskType: "WE"
- transcript: essay text (Phase 1 keeps existing field to avoid broad client breakage)
- questionContent: prompt text
- question_id: question id (already sent by store)

Server flow (WE):
1. Auth/access check (reuse current flow).
2. Deterministic Form precheck.
3. If form=0 -> return gate=not_scored immediately (skip LLM call).
4. Else call generateScoreTextWithFallback(prompt).
5. Parse/normalize WE JSON.
6. Apply gate: if content=0 then force not_scored and suppress other trait scoring output.
7. Return WE contract payload with estimated marker.

No endpoint split in Phase 1, so RA/RS/RL/WFD remain on existing path.

## 6) JSON Contract (WE)

### Scored response

```json
{
  "taskType": "WE",
  "status": "scored",
  "is_estimated": true,
  "review_label": "AI review (estimated)",
  "raw_total": 21,
  "raw_max": 26,
  "overall_estimated": 73,
  "traits": {
    "content": { "score": 5, "max": 6 },
    "form": { "score": 2, "max": 2 },
    "development_structure_coherence": { "score": 5, "max": 6 },
    "grammar": { "score": 1, "max": 2 },
    "general_linguistic_range": { "score": 4, "max": 6 },
    "vocabulary_range": { "score": 2, "max": 2 },
    "spelling": { "score": 2, "max": 2 }
  },
  "gate": {
    "triggered": false,
    "reason_codes": []
  },
  "form_signals": {
    "word_count": 236,
    "all_caps": false,
    "punctuation_density": 0.061,
    "bullet_like_ratio": 0,
    "very_short_sentence_ratio": 0.14
  },
  "feedback": "Estimated AI review: your structure is clear...",
  "provider_used": "gemini",
  "fallback_reason": null
}
```

### Not scored response (form gate)

```json
{
  "taskType": "WE",
  "status": "not_scored",
  "is_estimated": true,
  "review_label": "AI review (estimated)",
  "display_status": "Not scored / Needs rewrite",
  "raw_total": null,
  "raw_max": 26,
  "overall_estimated": null,
  "traits": {
    "content": null,
    "form": { "score": 0, "max": 2 },
    "development_structure_coherence": null,
    "grammar": null,
    "general_linguistic_range": null,
    "vocabulary_range": null,
    "spelling": null
  },
  "gate": {
    "triggered": true,
    "reason_codes": ["form_zero_word_count_out_of_range"]
  },
  "feedback": "Needs rewrite before scoring.",
  "provider_used": "none",
  "fallback_reason": null
}
```

### Not scored response (content gate)

Same as above except:
- traits.content.score = 0
- gate.reason_codes includes content_zero
- other traits null

## 7) Rule Layer vs AI Layer

Rule layer (deterministic, authoritative):
- Word counting and Form binning (2/1/0).
- Hard invalid patterns for form zero:
  - all caps
  - near-zero punctuation
  - bullet-like composition
  - mostly very short sentences
- Gate enforcement and final output state.
- Final raw_total and overall_estimated recomputation.

AI layer (Gemini primary, Groq fallback):
- Score semantic traits:
  - Content
  - Development, Structure and Coherence
  - Grammar
  - General Linguistic Range
  - Vocabulary Range
  - Spelling
- Provide concise coaching feedback.
- Return strict JSON (no markdown).

Conflict policy:
- Rule layer always wins for Form and gate.
- AI cannot override Form gate.

## 8) Gemini Primary + Groq Fallback Integration

Use existing service unchanged:
- generateScoreTextWithFallback({ prompt }) in backend/llm/score-llm-service.js

WE integration pattern:
1. Build WE prompt in api/score.js (or backend/we/we-prompt.js).
2. Call generateScoreTextWithFallback.
3. Preserve and pass through provider_used/fallback_reason to WE response.
4. Keep llm-health debug endpoint behavior unchanged.

This avoids introducing a second provider pipeline and keeps observability consistent with existing RA/RS/RL flows.

## 9) Sequencing - What to do now vs later

### Do now (Phase 1 scope)
1. WE API contract + backend normalization + deterministic Form/gate.
2. WE submit wiring in WEView and minimal in-page result card data rendering.
3. Explicit estimated/AI review labels.
4. Basic logs and store persistence for WE scores.

### Do later (explicitly out of scope now)
1. Complex history page and analytics dashboard.
2. Long-form essay correction and paragraph-level diagnostics.
3. Sentence-by-sentence rewrite suggestions.
4. Rich diff UI and rewrite coaching workflow.

## 10) Acceptance Criteria

Functional:
- WE submit triggers /api/score with taskType=WE and returns contract above.
- Form scoring matches required bins exactly.
- If form=0 OR content=0 then status=not_scored and UI shows Not scored / Needs rewrite.
- Scored essays use raw_total/26 and overall_estimated formula exactly.
- Response and UI always display estimated/AI review marker.

Safety/regression:
- RA submit/result path still works.
- WFD path unchanged (including question-audio/wfd assumptions and files).
- No modifications under question-audio/wfd/*.

Observability:
- provider_used and fallback_reason populated consistently for WE.
- Score errors still return safe fallback structure without breaking WE page rendering.

## 11) Risks and Mitigations

Risk: Over-aggressive form heuristics cause false gate.
- Mitigation: conservative thresholds + explicit reason codes + adjustable constants.

Risk: Model returns malformed JSON.
- Mitigation: strict parse with fallback error handling (reuse existing try/catch + error_stage).

Risk: Cross-task result shape collision in shared store.
- Mitigation: taskType-aware normalization and WE-specific card mapping in WEView.

Risk: Accidental RA/WFD regression while editing shared api/score.js.
- Mitigation: isolate WE branch and keep existing RA branch logic untouched.

## 12) ADR

Decision:
- Extend existing unified /api/score endpoint with a WE branch, not a new endpoint.

Drivers:
- Minimize churn/risk in auth/access/logging path.
- Reuse existing provider fallback chain.
- Deliver quickly with low regression probability.

Alternatives considered:
- New endpoint /api/score-we: clearer separation but duplicates access/error code paths.
- Frontend-only pseudo scoring: faster but violates quality requirement and official trait alignment.

Why chosen:
- Unified endpoint gives lowest integration risk and fastest delivery while preserving current architecture.

Consequences:
- api/score.js becomes larger unless helper files are extracted.
- Shared store normalization must become taskType-aware.

Follow-ups:
- Phase 2 can extract WE scoring to dedicated module without API contract break.
- Add formal automated tests when test runner is introduced.
