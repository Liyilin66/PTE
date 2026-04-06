# RA 题目页「题目情报 + 我的战绩」最小改版计划

## Requirements Summary
- 将 RA 题目页当前分散的 6 个同权重信息块，重组为「题目情报 + 我的战绩」双区域。
- 用户首屏 2 秒内能读懂两件事：题目难度/词数/预计用时；我在该题的历史表现与是否值得继续刷。
- 数据按当前题动态变化：difficulty、word count、estimated time、best score、last score（可取时）、attempt count、level tag。
- 无历史时仍给出完整视觉层次和指导文案，不出现生硬 `--`。
- 保持移动端可读性（单列堆叠），桌面端有层次（主次分区）。
- 复用现有按题 `practice_logs` 查询，不改 WFD 链路。

## Evidence Snapshot (Current State)
- 题目基础信息目前在 3 个均权白卡里展示：难度/预计用时/词数。
  - `d:\PTE\kai-kou\src\views\RAView.vue:1222`
- 历史表现目前在另一行展示，且值写死：`bestScore:79`, `totalAttempts:12`，等级文案固定“优秀”。
  - `d:\PTE\kai-kou\src\views\RAView.vue:98`
  - `d:\PTE\kai-kou\src\views\RAView.vue:1257`
- 按题历史数据来源已存在：`fetchRAHistoryByQuestion(questionId)` 查询 `practice_logs`。
  - `d:\PTE\kai-kou\src\lib\ra-history.js:6`
- RA 练习日志写入链路走 `practice_logs`，并携带 `score_json`、`feedback`、`created_at`。
  - `d:\PTE\kai-kou\src\stores\practice.js:248`
- WFD 也写 `practice_logs`（共享存储），因此只动 RA 读取侧，避免改写入链路。
  - `d:\PTE\kai-kou\src\views\WFDView.vue:284`

## Recommended UI Structure
### 区域 1：题目情报（主卡）
- 位置：左侧（桌面）/ 上方（移动端）
- 视觉：更高对比度卡片 + 难度色带 + 三项关键数字
- 内容：
  - 难度标签（简单/中等/困难 + 颜色）
  - 词数（优先 `question.word_count || question.wordCount`，缺失回退实时分词）
  - 预计用时（由词数推导）
  - 辅助一句：例如“适合 1 次完整朗读”

### 区域 2：我的战绩（次卡）
- 位置：右侧（桌面）/ 下方（移动端）
- 视觉：分层信息（主数字 > 次级趋势 > 建议）
- 内容：
  - 最高分（主数字）
  - 最近一次分数（若存在）
  - 练习次数
  - 等级标签（基于最高分）
  - 建议文案（值不值得继续刷）

### 布局规则
- `grid-cols-1`（移动）
- `md:grid-cols-[1.2fr_0.8fr]`（桌面）
- 两区之间保留 12~16px 间距；主卡信息密度高于次卡。

## Dynamic Copy Rules
### 题目情报
- 难度：
  - `difficulty <= 1` -> `简单`
  - `difficulty == 2` -> `中等`
  - `difficulty >= 3` -> `困难`
- 预计用时（秒）：
  - `estimatedSec = clamp(round(wordCount / 2.6), 18, 45)`
  - 展示：`约 {estimatedSec} 秒`

### 我的战绩核心字段
- `bestScore`：该题该用户历史最高 overall
- `lastScore`：最近一条记录 overall（按 `created_at desc`）
- `attemptCount`：该题该用户历史总次数
- `levelTag`（基于 `bestScore`）：
  - `>= 75` -> `优秀`
  - `>= 60` -> `良好`
  - `< 60` -> `待提升`

### 建议文案（是否继续刷）
- 无历史：`首次练习，先打一遍基准分。`
- `attemptCount < 3`：`样本较少，建议再练 1-2 次看稳定性。`
- `bestScore < 60`：`基础段，建议继续刷这题。`
- `60 <= bestScore < 75`：`有提分空间，建议冲到 75+。`
- `bestScore >= 75 && lastScore >= 75`：`该题已稳定，可换新题。`
- `bestScore >= 75 && lastScore < 75`：`最近有回落，建议再刷 1 次巩固。`

## File Change Plan
1. `d:\PTE\kai-kou\src\lib\ra-history.js`
- 新增聚合查询函数（建议名：`fetchRAQuestionPerformance(questionId)`）。
- 复用当前按题过滤条件（task_type/user_id/question_id）。
- 输出统一结构：`{ bestScore, lastScore, totalAttempts, levelTag, hasHistory }`。
- 保留 `fetchRAHistoryByQuestion` 原行为，避免影响历史面板。

2. `d:\PTE\kai-kou\src\views\RAView.vue`
- 移除现有六宫格拆分展示（3 张题目卡 + 1 条历史条）并合并成“双区块”。
- 替换硬编码 `historicalStats`，改为 reactive/computed 动态对象。
- 在题目切换 watcher 内，联动拉取题目战绩摘要（与已有 history 刷新节奏一致）。
- 新增无历史占位 UI（有设计感空态，不显示 `--`）。
- 响应式布局：移动端单列、桌面双列。

3. （可选，若希望复用规则）`d:\PTE\kai-kou\src\lib\ra-performance.js`
- 抽出纯函数：`getLevelTag`, `getEstimatedSeconds`, `getRecommendationCopy`。
- 目标：避免 RAView 计算逻辑膨胀。
- 若追求最小 diff，可先不新增文件，逻辑写在 RAView 内。

## Risks & Mitigations
- 风险 1：聚合查询若读取全量历史，单题超高频用户可能慢。
  - 缓解：先仅取必要列（`score_json`,`created_at`）；后续若数据量增长再下推 SQL 聚合。
- 风险 2：旧日志 `score_json` 不完整导致分数解析异常。
  - 缓解：沿用 `normalizeRALog` 的 fallback overall 规则。
- 风险 3：RA 文案阈值与 Result 页阈值可能漂移。
  - 缓解：同阈值（75/60）并在代码注释引用来源。
- 风险 4：改动 RAView 布局时误触 WFD 共享逻辑。
  - 缓解：不改 `stores/practice.js` 写入链路，不改 `WFDView.vue`。

## Acceptance Criteria
- AC1：进入 RA 题目页，首屏能看到明确两区块标题「题目情报」「我的战绩」。
- AC2：切题后，难度/词数/预计用时同步变化。
- AC3：切题后，最高分/最近一次/练习次数/等级随该题历史动态变化。
- AC4：无历史时显示完整空态文案和视觉，而非 `--`。
- AC5：移动端（<=768px）单列布局可读，桌面端双区层次清晰。
- AC6：RA 历史面板（Show History）仍可正常加载最近记录。
- AC7：WFD 做题、评分、写入 `practice_logs` 行为不变（回归 smoke test 通过）。

## Verification Steps
- 手工验证：
  - 选 1 道无历史题，检查空态。
  - 选 1 道有 >=3 次历史题，核对 best/last/attempt 数值。
  - 在 RAList 选题切换 3 次，确认动态更新。
  - 移动端宽度（375px）和桌面宽度（>=1024px）各检查 1 次。
- 回归验证：
  - 执行 RA 基本流程（开始->录音->提交->结果）
  - 执行 WFD 基本流程 1 次，确认无回归。
