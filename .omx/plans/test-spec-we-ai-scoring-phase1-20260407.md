# Test Spec - WE AI Scoring Phase 1

Date: 2026-04-07
Scope: D:\PTE\kai-kou
Linked PRD: .omx/plans/prd-we-ai-scoring-phase1-20260407.md

## 1) Verification Strategy

- Unit-like checks for deterministic rule layer (form bins and gate triggers).
- API contract checks for scored and not_scored responses.
- Manual frontend checks for WE result card rendering and gate states.
- Regression smoke for RA/WFD stability.

## 2) Rule Layer Test Matrix (Form)

### Word count bins
1. 90 words -> form=0, gate=true
2. 150 words -> form=1, gate=false (continue to AI)
3. 220 words -> form=2, gate=false
4. 330 words -> form=1, gate=false
5. 400 words -> form=0, gate=true

### Hard form-zero conditions
1. All uppercase essay (200 words) -> form=0, gate=true
2. Nearly no punctuation essay (220 words) -> form=0, gate=true
3. Bullet-heavy essay -> form=0, gate=true
4. Mostly very short fragments -> form=0, gate=true

Expected for all form-zero cases:
- status=not_scored
- overall_estimated=null
- display_status="Not scored / Needs rewrite"
- provider_used="none" when pre-LLM gate applies

## 3) Gate Test Matrix (Content)

1. Form valid + model content=0
- status=not_scored
- traits.content.score=0
- all non-form other traits are null in final payload
- overall_estimated=null

2. Form valid + model content>=1
- status=scored
- all traits populated with valid ranges

## 4) Range and Formula Validation

For scored responses:
- Content in [0,6]
- Form in [0,2]
- Development/Structure/Coherence in [0,6]
- Grammar in [0,2]
- General Linguistic Range in [0,6]
- Vocabulary Range in [0,2]
- Spelling in [0,2]
- raw_total equals exact trait sum
- overall_estimated equals round(raw_total / 26 * 90)

## 5) API Contract Checks

### Required keys
- taskType
- status
- is_estimated=true
- review_label includes "estimated"
- gate object
- provider_used/fallback_reason

### Scored response contract
- status=scored
- raw_total number
- overall_estimated number
- traits all present and non-null

### Not scored response contract
- status=not_scored
- display_status="Not scored / Needs rewrite"
- overall_estimated=null
- gate.triggered=true
- traits suppressed per gate rule

## 6) Fallback Chain Verification

1. Gemini success path
- provider_used=gemini
- fallback_reason=null

2. Simulated Gemini fallback-eligible error (timeout/429/503) with Groq key configured
- provider_used=groq
- fallback_reason populated

3. Gemini fallback-eligible error without Groq key
- API returns ai_error-safe payload
- no frontend crash

## 7) Frontend Verification (WE page)

1. Submit empty body
- warning shown, no API call

2. Submit form-zero essay
- result card shows Not scored / Needs rewrite
- estimated badge visible
- no detailed trait bars except form/content per gate policy

3. Submit normal essay (200-300 words)
- result card shows overall_estimated + raw_total/26
- all 7 traits visible
- estimated/AI review label visible

4. Retry with another question
- old WE result does not leak into new attempt unexpectedly

## 8) Regression Smoke (Mandatory)

1. RA submit and RA result page still works.
2. RL submit/result still works.
3. RS submit/result still works.
4. WFD submit/result still works.
5. No edits in question-audio/wfd/*.

## 9) Exit Criteria

All must pass:
- Form bins and gates are correct for all listed cases.
- Content/Form gate behavior exactly matches PRD.
- Scored formula and trait ranges are correct.
- Estimated labeling is always visible in WE results.
- RA/WFD paths show no regression.
