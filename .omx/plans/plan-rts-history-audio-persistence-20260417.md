# RTS 历史录音持久化回放实施计划（2026-04-17）

## Requirements Summary
- 目标 1：实现 RTS 录音的持久化回放，支持跨页面/历史记录听旧录音。
- 目标 2：`最近练习` 区块只展示“当前题”的最近一次练习（评分 + 录音）。
- 目标 3：`历史录音` 区块展示最近 20 条录音并可直接播放。

## Scope Assumption
- “最近练习”指 [RTSHomeView.vue](d:/PTE/kai-kou/src/views/RTSHomeView.vue) 中该区块（现为全局最近列表）。
- “当前题”优先取当前会话题目（建议用 `practiceStore.rtsSession.questionId`）；若为空则回退到最近一次练习题目。

## Current-State Evidence
- RTS 历史区仅在 `item.hasAudio` 时显示 `<audio>`，否则只显示“进入题目重练”：  
  [RTSPracticeView.vue:4217](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:4217), [RTSPracticeView.vue:4219](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:4219)
- `historyItems` 对远端日志硬编码 `blobUrl: ""`、`hasAudio: false`：  
  [RTSPracticeView.vue:303](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:303), [RTSPracticeView.vue:306](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:306)
- RTS 写 `practice_logs` 时未写音频元数据，仅 `self_rating/duration_sec/topic/tone`：  
  [RTSPracticeView.vue:3439](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:3439)
- `getUserRTSStats` 仅返回 `recentLogs` 基础字段，不含音频可回放信息：  
  [useRTSData.js:1034](d:/PTE/kai-kou/src/composables/useRTSData.js:1034), [useRTSData.js:1052](d:/PTE/kai-kou/src/composables/useRTSData.js:1052)
- RTS 首页 `最近练习` 当前只做跳转重练，没有回放控件：  
  [RTSHomeView.vue:190](d:/PTE/kai-kou/src/views/RTSHomeView.vue:190), [RTSHomeView.vue:208](d:/PTE/kai-kou/src/views/RTSHomeView.vue:208)
- 项目已有 RA/DI 的私有音频桶与签名 URL 回放模式，可复用：  
  [ra-history.js:79](d:/PTE/kai-kou/src/lib/ra-history.js:79), [di-history.js:242](d:/PTE/kai-kou/src/lib/di-history.js:242), [ra-practice-audio.sql:15](d:/PTE/kai-kou/db/ra-practice-audio.sql:15), [di-practice-audio.sql:14](d:/PTE/kai-kou/db/di-practice-audio.sql:14)

## Acceptance Criteria (Testable)
1. RTS 每次有效练习写入 `practice_logs` 时，`score_json.audio` 持久化保存（`bucket/path/mimeType/size/uploadedAt`）。
2. 用户刷新页面、重新登录、跨页面返回后，仍能在 RTS 历史区播放旧录音。
3. RTS 练习页 `历史录音` 默认展示最近 20 条；每条有可点击播放音频（可用时显示 `<audio controls>`）。
4. RTS 首页 `最近练习` 只展示“当前题”最近一条记录，且包含评分与录音播放入口。
5. 无录音元数据的旧历史记录不报错，UI 仅降级为“进入题目重练”。
6. 非本人路径或无权限路径不会生成可用播放链接（安全边界生效）。
7. 不影响 RA/DI/WFD 现有回放和评分链路。
8. 在弱网/签名链接过期场景，支持重取签名链接后恢复播放。

## Implementation Steps

### Step 1: 数据结构与存储策略补齐（RTS 音频路径可读写）
- 新增 SQL：`db/rts-practice-audio.sql`（参考 RA/DI 模板）
  - `select/insert/update/delete` 策略限定 `bucket_id='practice-audio'` 且 `name` 前缀 `rts/<auth.uid()>/`
  - 参考实现：  
    [ra-practice-audio.sql:15](d:/PTE/kai-kou/db/ra-practice-audio.sql:15), [di-practice-audio.sql:14](d:/PTE/kai-kou/db/di-practice-audio.sql:14)
- 文档补充：`README.md` 增加 RTS 音频持久化初始化步骤（SQL 执行、回放校验）

### Step 2: RTS 录音上传并写入 `score_json.audio`
- 在 [RTSPracticeView.vue](d:/PTE/kai-kou/src/views/RTSPracticeView.vue) 的 `persistCurrentPractice()` 中接入上传逻辑：
  - 来源音频：`recordingStopResult.value?.blob`（已在 stop 流程中产出）
  - 路径规范：`rts/<userId>/<timestamp>-<questionId>-<suffix>.<ext>`
  - 写库结构：
    - `score_json.self_rating`
    - `score_json.duration_sec`
    - `score_json.audio`（新增）
- 推荐复用/抽象 [practice.js:1009](d:/PTE/kai-kou/src/stores/practice.js:1009) 的上传函数思路，避免 RTS 自己再造一套 MIME/扩展名处理。
- 失败降级：上传失败不阻塞日志写入，但 `audio` 置空并记录 warning（与现有容错风格一致）。

### Step 3: RTS 历史数据模型扩展（返回 audioMeta + 签名链接）
- 在 [useRTSData.js](d:/PTE/kai-kou/src/composables/useRTSData.js) 增加：
  - `normalizeRTSAudioMeta(scoreJson.audio)`（兼容空值与旧数据）
  - `getRTSPlaybackUrl(audioMeta, userId, ttl)`（`createSignedUrl`）
  - `buildRecentLogs()` 返回字段扩展：`audioMeta`, `hasAudio`, `playbackUrl?`
- 查询字段维持现状 `score_json` 即可，不需新增列（`practice_logs.score_json` 为 JSONB，见 [README.md:223](d:/PTE/kai-kou/README.md:223)）。
- 签名 URL 策略：
  - 首屏可懒加载（点击播放时才请求）以控制 20 条签名开销
  - 或先为前 N 条预签名，其余懒加载
  - 建议 TTL 20~30 分钟，过期自动重取

### Step 4: RTS 练习页“历史录音”改为最近 20 条持久化回放
- 修改 [RTSPracticeView.vue](d:/PTE/kai-kou/src/views/RTSPracticeView.vue)：
  - `loadTodayStatsPanel()` 改为请求 `recentLimit: 20`
  - `historyItems` 以远端持久化记录为主，保留本地未持久化记录仅作临时补位
  - 标题改为“历史录音（最近20条）”
  - 每条提供播放控件：
    - `hasAudio=true` 时展示 `<audio controls :src=\"signedUrl\">`
    - 无音频保留“进入题目重练”
- 将现有“source=remote 强制无音频”的逻辑删除：  
  [RTSPracticeView.vue:303](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:303), [RTSPracticeView.vue:306](d:/PTE/kai-kou/src/views/RTSPracticeView.vue:306)

### Step 5: RTS 首页“最近练习”改为当前题单条（评分+录音）
- 修改 [RTSHomeView.vue](d:/PTE/kai-kou/src/views/RTSHomeView.vue)：
  - 不再渲染全局 `recentLogs` 列表（当前 `v-for` 多条）
  - 仅渲染当前题 `currentQuestionLatestPractice`（单条）
  - 增加播放控件（有音频则可直接听）
- 数据来源：
  - 在 `getUserRTSStats` 增加 `currentQuestionId` 参数和返回 `currentQuestionLatestLog`
  - `currentQuestionId` 读取优先级：`practiceStore.rtsSession.questionId` > 最近日志首条 `questionId`

### Step 6: 兼容与迁移策略
- 旧数据无 `score_json.audio`：显示“无录音可回放”，仍可“进入题目重练”。
- 新老数据并存阶段不做一次性迁移脚本，按新增记录自然覆盖。
- 如后续需要补历史音频，可另立离线迁移任务（不纳入本次范围）。

## Risks and Mitigations
- 风险 1：`practice-audio` 缺少 RTS RLS policy，导致上传/签名 403  
  - 缓解：先执行 `db/rts-practice-audio.sql`，在联调前跑最小上传/签名探针。
- 风险 2：20 条全部预签名导致加载变慢  
  - 缓解：懒加载签名 + 本地缓存已签名 URL（按 `logId + updatedAt`）。
- 风险 3：签名 URL 过期后播放失败  
  - 缓解：`audio` 播放错误时触发一次重新签名并重试。
- 风险 4：当前题判定不稳定  
  - 缓解：固定优先级策略并在 UI 显示 questionId 以便排查。

## Verification Steps
1. 准备环境
   - 执行 `db/rts-practice-audio.sql`
   - 确认 `practice-audio` 桶存在且为 private
2. 功能验证（手动）
   - 在 RTS 练习页完成 3 次录音并“下一题”
   - 刷新页面后进入历史区，确认可播放刚才录音
   - 退出登录再登录，确认历史回放仍可用
3. 列表口径验证
   - RTS 首页 `最近练习` 仅 1 条，且属于当前题
   - RTS 练习页 `历史录音` 展示最多 20 条
4. 兼容验证
   - 对旧日志（无 audio）不报错，按钮回退为“进入题目重练”
5. 回归验证
   - RA/DI 历史回放可用
   - WFD、WE、RA、RS、RL 主流程不受影响

## Out-of-Scope
- 旧 RTS 记录的批量补录音迁移。
- 音频波形可视化、倍速播放、下载录音等增强能力。
