# Ralph Context Snapshot

- task statement: Implement RA page redesign module "题目情报 + 我的战绩" based on saved plan.
- desired outcome: Replace static six-card feel with dynamic two-area module, responsive layout, no-history graceful state.
- known facts/evidence:
  - RA six-card-like blocks live in src/views/RAView.vue around metadata/history sections.
  - historicalStats is hardcoded in RAView and must be removed.
  - Per-question RA history already queried via src/lib/ra-history.js fetchRAHistoryByQuestion.
  - practice_logs write path is in stores/practice.js and must remain unchanged.
- constraints:
  - Modify only RAView/ra-history and optional RA helper.
  - Keep This Question History panel.
  - Do not modify WFD chain.
- unknowns/open questions:
  - None blocking; thresholds and copy rules are explicitly provided.
- likely codebase touchpoints:
  - src/views/RAView.vue
  - src/lib/ra-history.js
