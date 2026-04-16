async (page) => {
  const baseUrl = "http://127.0.0.1:5173";
  const email = "156277702@qq.com";
  const password = "050103";
  const artifactDir = "output/playwright";
  let browserLabel = "unknown";

  const result = {
    browser: browserLabel,
    baseUrl,
    startedAt: new Date().toISOString(),
    steps: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    networkFailures: [],
    notes: [],
    snapshots: {}
  };

  const pushStep = (id, name, status, detail, extra = {}) => {
    result.steps.push({ id, name, status, detail, ...extra });
  };

  const safeVisible = async (locator) => {
    try {
      return await locator.isVisible();
    } catch {
      return false;
    }
  };

  const safeEnabled = async (locator) => {
    try {
      return await locator.isEnabled();
    } catch {
      return false;
    }
  };

  const pollUntil = async (fn, timeoutMs = 30000, intervalMs = 400) => {
    const started = Date.now();
    let lastValue = null;
    while (Date.now() - started <= timeoutMs) {
      try {
        const value = await fn();
        if (value) {
          return {
            ok: true,
            value,
            elapsedMs: Date.now() - started
          };
        }
        lastValue = value;
      } catch (error) {
        lastValue = {
          error: `${error?.message || error || ""}`.trim()
        };
      }
      await page.waitForTimeout(intervalMs);
    }
    return {
      ok: false,
      value: lastValue,
      elapsedMs: Date.now() - started
    };
  };

  const getPlaybackSnapshot = async () => {
    return page.evaluate(() => {
      const playbackRoot = Array.from(document.querySelectorAll("section")).find((node) => {
        const text = `${node?.innerText || ""}`;
        return text.includes("回放阶段") && text.includes("下一题");
      }) || document.body;
      const panelText = `${playbackRoot?.innerText || ""}`;
      const audio = playbackRoot.querySelector("audio[controls]");
      const diagPanel = Array.from(playbackRoot.querySelectorAll("section")).find((node) =>
        `${node?.innerText || ""}`.includes("录音诊断（最近一次 stop）")
      );
      const unavailableNode = Array.from(playbackRoot.querySelectorAll("p")).find((node) => {
        const text = `${node?.innerText || ""}`;
        return /录音无效|未检测到可用录音|回放不可用|请重录|无法播放|录音失败/.test(text);
      });
      const probeRejectedMatch = panelText.match(/rtsProbeRejected:\s*(true|false)/i);
      const probeWarningMatch = panelText.match(/rtsProbeWarningOnly:\s*(true|false)/i);
      const diagTop = diagPanel ? Number(diagPanel.getBoundingClientRect().top || 0) : null;
      const audioTop = audio ? Number(audio.getBoundingClientRect().top || 0) : null;
      const unavailableTop = unavailableNode ? Number(unavailableNode.getBoundingClientRect().top || 0) : null;
      const audioSrc = `${audio?.getAttribute("src") || ""}`;

      return {
        audioExists: Boolean(audio),
        audioSrc,
        audioSrcKind: audioSrc.startsWith("blob:") ? "blob" : (audioSrc ? "non_blob" : ""),
        diagVisible: Boolean(diagPanel) || panelText.includes("录音诊断（最近一次 stop）"),
        diagTop,
        audioTop,
        unavailableTop,
        probeRejectedText: probeRejectedMatch ? `${probeRejectedMatch[1]}`.toLowerCase() : "",
        probeWarningOnlyText: probeWarningMatch ? `${probeWarningMatch[1]}`.toLowerCase() : "",
        probeHintVisible: panelText.includes("RTS 二次 probe 未通过，但共享层已返回可播录音，当前仍允许直接回放。"),
        unavailableMessageVisible: Boolean(unavailableNode),
        bodyExcerpt: panelText.slice(0, 1800)
      };
    });
  };

  page.on("console", (msg) => {
    const type = `${msg.type() || ""}`.toLowerCase();
    const text = `${msg.text() || ""}`.trim();
    if (!text) return;
    if (type === "error") {
      result.consoleErrors.push({ type, text, location: msg.location?.() || null });
    } else if (type === "warning" || type === "warn") {
      result.consoleWarnings.push({ type, text, location: msg.location?.() || null });
    }
  });
  page.on("pageerror", (error) => {
    result.pageErrors.push(`${error?.message || error || ""}`.trim());
  });
  page.on("requestfailed", (request) => {
    result.networkFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "UNKNOWN"
    });
  });

  try {
    const ua = await page.evaluate(() => navigator.userAgent || "");
    if (/Edg\//i.test(ua)) browserLabel = "msedge";
    else if (/Chrome\//i.test(ua)) browserLabel = "chrome";
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browserLabel = "webkit";
    result.browser = browserLabel;
    result.notes.push(`UA: ${ua}`);
  } catch (error) {
    result.notes.push(`UA detect failed: ${`${error?.message || error || ""}`.trim()}`);
  }

  if (browserLabel === "webkit") {
    try {
      await page.addInitScript(() => {
        if (window.__RTS_SYNTH_MEDIA_PATCH__) return;
        window.__RTS_SYNTH_MEDIA_PATCH__ = true;
        const nav = navigator;
        if (!nav.mediaDevices) {
          nav.mediaDevices = {};
        }
        const originalGetUserMedia = typeof nav.mediaDevices.getUserMedia === "function"
          ? nav.mediaDevices.getUserMedia.bind(nav.mediaDevices)
          : null;

        nav.mediaDevices.getUserMedia = async (constraints) => {
          const needAudio = Boolean(constraints && typeof constraints === "object" && constraints.audio);
          if (needAudio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
              const ctx = new Ctx();
              try {
                await ctx.resume();
              } catch {
                // no-op
              }
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              gain.gain.value = 0.02;
              const dest = ctx.createMediaStreamDestination();
              osc.connect(gain);
              gain.connect(dest);
              osc.start();
              const stream = dest.stream;
              if (stream && typeof stream.getAudioTracks === "function" && stream.getAudioTracks().length > 0) {
                return stream;
              }
            }
          }
          if (originalGetUserMedia) {
            return originalGetUserMedia(constraints);
          }
          throw new Error("getUserMedia_unavailable");
        };
      });
      result.notes.push("webkit synthetic getUserMedia patch applied");
    } catch (error) {
      result.notes.push(`webkit media patch failed: ${`${error?.message || error || ""}`.trim()}`);
    }
  }

  try {
    await page.addInitScript(() => {
      try {
        window.localStorage?.setItem("RTS_RECORDER_DEBUG", "1");
      } catch {
        // no-op
      }
    });
  } catch (error) {
    result.notes.push(`RTS_RECORDER_DEBUG init failed: ${`${error?.message || error || ""}`.trim()}`);
  }

  try {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.context().grantPermissions(["microphone"], { origin: baseUrl });
  } catch (error) {
    result.notes.push(`grantPermissions failed: ${`${error?.message || error || ""}`.trim()}`);
  }

  try {
    await page.goto(`${baseUrl}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
  } catch (error) {
    pushStep(
      "auth.open",
      "打开登录页",
      "fail",
      `无法访问 ${baseUrl}/auth: ${`${error?.message || error || ""}`.trim()}`
    );
    result.finishedAt = new Date().toISOString();
    return result;
  }

  if (page.url().includes("/auth")) {
    try {
      const emailInput = page.locator('input[placeholder="your@email.com"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.waitFor({ timeout: 20000 });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await passwordInput.press("Enter");
      await pollUntil(async () => (!page.url().includes("/auth") ? { url: page.url() } : null), 25000, 500);
      if (page.url().includes("/auth")) {
        const loginButton = page.locator('button:has-text("登录"), button:has-text("鐧诲綍")').first();
        if (await safeVisible(loginButton)) {
          await loginButton.click({ timeout: 6000 });
          await pollUntil(async () => (!page.url().includes("/auth") ? { url: page.url() } : null), 20000, 500);
        }
      }
    } catch (error) {
      pushStep("auth.login", "登录", "fail", `${error?.message || error || ""}`);
      result.finishedAt = new Date().toISOString();
      return result;
    }
  }

  if (page.url().includes("/auth")) {
    pushStep("auth.login", "登录", "fail", "仍停留在 /auth，账号未成功进入会话。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  pushStep("auth.login", "登录", "pass", `登录成功，当前 URL: ${page.url()}`);

  try {
    await page.goto(`${baseUrl}/rts/practice`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (error) {
    pushStep("rts.open", "进入 RTS 页面", "fail", `${error?.message || error || ""}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  if (page.url().includes("/auth")) {
    pushStep("rts.open", "进入 RTS 页面", "fail", "访问 /rts/practice 被重定向回 /auth。");
    result.finishedAt = new Date().toISOString();
    return result;
  }
  pushStep("rts.open", "进入 RTS 页面", "pass", `已进入 ${page.url()}`);

  const manualSceneButton = page.locator('button:has-text("点击播放场景音频")').first();
  const autoplayBlockedTitle = page.locator('text=浏览器拦截了自动播放').first();
  const preparingHint = page.locator('text=准备阶段会在').first();
  const scenePlayingButton = page.locator('button:has-text("正在播放场景")').first();

  const autoplayObserve = await pollUntil(async () => {
    if (await safeVisible(manualSceneButton) || await safeVisible(autoplayBlockedTitle)) {
      return { state: "blocked_prompt" };
    }
    if (await safeVisible(scenePlayingButton)) {
      return { state: "playing" };
    }
    if (await safeVisible(preparingHint)) {
      return { state: "preparing" };
    }
    return null;
  }, 45000, 500);

  const autoplayBlockedShown = autoplayObserve.ok && autoplayObserve.value?.state === "blocked_prompt";
  pushStep(
    "scene.2.autoplay_prompt",
    "autoplay 失败是否出现“点击播放场景音频”入口",
    autoplayBlockedShown ? "pass" : "fail",
    autoplayBlockedShown
      ? "检测到自动播放被拦截入口。"
      : `未观察到拦截入口；观察状态=${autoplayObserve.value?.state || "timeout"}`
  );

  let firstScenePlayable = false;
  let manualResumeRecovered = false;

  if (autoplayBlockedShown && await safeVisible(manualSceneButton)) {
    try {
      await manualSceneButton.click({ timeout: 8000 });
      const afterManual = await pollUntil(async () => {
        if (await safeVisible(scenePlayingButton)) return { state: "playing" };
        if (await safeVisible(preparingHint)) return { state: "preparing" };
        return null;
      }, 40000, 500);
      firstScenePlayable = Boolean(afterManual.ok);
      manualResumeRecovered = Boolean(afterManual.ok);
    } catch (error) {
      firstScenePlayable = false;
      manualResumeRecovered = false;
      result.notes.push(`manual scene resume click failed: ${`${error?.message || error || ""}`.trim()}`);
    }
  } else if (autoplayObserve.ok && (autoplayObserve.value?.state === "playing" || autoplayObserve.value?.state === "preparing")) {
    firstScenePlayable = true;
    manualResumeRecovered = false;
  }

  pushStep(
    "scene.1.first_play",
    "首次进入题目后场景音频可播放",
    firstScenePlayable ? "pass" : "fail",
    firstScenePlayable ? "已观测到播放或进入准备阶段。" : "未观测到可播放状态。"
  );
  pushStep(
    "scene.3.manual_resume",
    "手动点击后可恢复播放",
    autoplayBlockedShown ? (manualResumeRecovered ? "pass" : "fail") : "na",
    autoplayBlockedShown
      ? (manualResumeRecovered ? "手动恢复后已进入播放/准备流程。" : "手动恢复后仍未进入播放流程。")
      : "本次未触发 autoplay 拦截，无法验证该分支。"
  );

  const prepareReadyRound1 = await pollUntil(async () => {
    if (await safeVisible(preparingHint)) return { ready: true };
    return null;
  }, 80000, 700);

  if (!prepareReadyRound1.ok) {
    pushStep("record.round1.prepare", "第一题进入准备阶段", "fail", "等待准备阶段超时，后续录音回放检查未执行。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const startRecordButton = page.locator('button:has-text("准备完毕，开始回应")').first();
  const stopRecordButton = page.locator('button:has-text("正在录音")').first();
  const round1StartAttempts = [];
  let round1RecordingVisible = false;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await startRecordButton.waitFor({ timeout: 12000 });
      await startRecordButton.click({ timeout: 8000 });
      const recordingAppeared = await pollUntil(async () => {
        if (await safeVisible(stopRecordButton)) return { visible: true };
        return null;
      }, 10000, 500);
      if (recordingAppeared.ok) {
        round1StartAttempts.push({ attempt, state: "recording_visible" });
        round1RecordingVisible = true;
        break;
      }
      const backToPrepare = await safeVisible(startRecordButton);
      round1StartAttempts.push({ attempt, state: backToPrepare ? "returned_preparing" : "unknown_no_recording" });
    } catch (error) {
      round1StartAttempts.push({ attempt, state: `error:${`${error?.message || error || ""}`.trim()}` });
    }
  }
  if (!round1RecordingVisible) {
    pushStep(
      "record.round1.start",
      "第一题开始录音",
      "fail",
      `录音阶段未出现，attempts=${JSON.stringify(round1StartAttempts)}`
    );
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const stopReady = await pollUntil(async () => {
    if (!await safeVisible(stopRecordButton)) return null;
    if (!await safeEnabled(stopRecordButton)) return null;
    return { ready: true };
  }, 45000, 500);

  if (!stopReady.ok) {
    pushStep("record.round1.stop_ready", "第一题录音可结束", "fail", "停止按钮未在预期时间内可用。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    if (window.__RTS_FORCE_PROBE_REJECT_INSTALLED__) return;
    window.__RTS_FORCE_PROBE_REJECT_INSTALLED__ = true;
    const originalPlay = HTMLMediaElement.prototype.play;
    let remainingReject = 1;
    HTMLMediaElement.prototype.play = function patchedPlay(...args) {
      const src = `${this?.currentSrc || this?.src || ""}`;
      if (remainingReject > 0 && src.startsWith("blob:")) {
        remainingReject -= 1;
        return Promise.reject(new DOMException("forced_probe_reject", "NotAllowedError"));
      }
      return originalPlay.apply(this, args);
    };
  });

  try {
    await stopRecordButton.click({ timeout: 10000 });
  } catch (error) {
    pushStep("record.round1.stop", "第一题结束录音", "fail", `${error?.message || error || ""}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const playbackRound1Ready = await pollUntil(async () => {
    const audioVisible = await safeVisible(page.locator("audio[controls]").first());
    const diagVisible = await safeVisible(page.locator("text=录音诊断（最近一次 stop）").first());
    const unavailableVisible = await safeVisible(page.locator("text=录音无效").first())
      || await safeVisible(page.locator("text=请重录").first())
      || await safeVisible(page.locator("text=回放不可用").first());
    const finalizePending = await safeVisible(page.locator("text=正在生成录音回放，请稍候").first());
    if (!finalizePending && (audioVisible || unavailableVisible || diagVisible)) {
      return { audioVisible, unavailableVisible, diagVisible };
    }
    return null;
  }, 40000, 500);

  if (!playbackRound1Ready.ok) {
    pushStep("record.round1.playback", "第一题进入回放区", "fail", "录音结束后未进入可观察回放状态。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const playback1 = await getPlaybackSnapshot();
  result.snapshots.playbackRound1 = playback1;

  const snap1Path = `${artifactDir}/${browserLabel}-rts-playback-round1.png`;
  try {
    await page.screenshot({ path: snap1Path, fullPage: true });
    result.snapshots.playbackRound1Screenshot = snap1Path;
  } catch (error) {
    result.notes.push(`round1 screenshot failed: ${`${error?.message || error || ""}`.trim()}`);
  }

  const round1AudioPass = playback1.audioExists && playback1.audioSrcKind === "blob";
  pushStep(
    "record.1.audio_controls",
    "录音后 blob/objectURL 存在时展示 <audio controls>",
    round1AudioPass ? "pass" : "fail",
    `audioExists=${playback1.audioExists}, audioSrcKind=${playback1.audioSrcKind || "none"}`
  );

  const round1ProbeRejected = playback1.probeRejectedText === "true";
  const round1ProbeKeepPlayerPass = round1ProbeRejected && playback1.audioExists && playback1.probeHintVisible;
  pushStep(
    "record.2.probe_reject_keep_player",
    "RTS 二次 probe 失败时不隐藏播放器",
    round1ProbeKeepPlayerPass ? "pass" : "fail",
    `probeRejected=${playback1.probeRejectedText || "unknown"}, audioExists=${playback1.audioExists}, hint=${playback1.probeHintVisible}`
  );

  const nextQuestionButton = page.locator('button:has-text("下一题")').first();
  try {
    await nextQuestionButton.click({ timeout: 10000 });
  } catch (error) {
    pushStep("scene.4.next_question", "下一题后场景音频继续可用", "fail", `无法点击下一题: ${`${error?.message || error || ""}`.trim()}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  await page.waitForTimeout(1500);

  const nextSceneObserve = await pollUntil(async () => {
    if (await safeVisible(manualSceneButton) || await safeVisible(autoplayBlockedTitle)) return { state: "blocked_prompt" };
    if (await safeVisible(scenePlayingButton)) return { state: "playing" };
    if (await safeVisible(preparingHint)) return { state: "preparing" };
    return null;
  }, 45000, 500);

  let nextSceneUsable = false;
  if (nextSceneObserve.ok && nextSceneObserve.value?.state === "blocked_prompt" && await safeVisible(manualSceneButton)) {
    await manualSceneButton.click({ timeout: 8000 });
    const resumeNext = await pollUntil(async () => {
      if (await safeVisible(scenePlayingButton)) return { state: "playing" };
      if (await safeVisible(preparingHint)) return { state: "preparing" };
      return null;
    }, 40000, 500);
    nextSceneUsable = resumeNext.ok;
  } else if (nextSceneObserve.ok && (nextSceneObserve.value?.state === "playing" || nextSceneObserve.value?.state === "preparing")) {
    nextSceneUsable = true;
  }

  pushStep(
    "scene.4.next_question",
    "下一题后场景音频继续可用",
    nextSceneUsable ? "pass" : "fail",
    nextSceneUsable ? "下一题仍可播放/进入准备流程。" : `下一题未观测到可播放状态，state=${nextSceneObserve.value?.state || "timeout"}`
  );

  const prepareReadyRound2 = await pollUntil(async () => {
    if (await safeVisible(preparingHint)) return { ready: true };
    return null;
  }, 80000, 700);

  if (!prepareReadyRound2.ok) {
    pushStep("record.round2.prepare", "第二题进入准备阶段（失败诊断验证）", "fail", "等待准备阶段超时。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  try {
    await startRecordButton.click({ timeout: 10000 });
  } catch (error) {
    pushStep("record.round2.start", "第二题开始录音（失败诊断验证）", "fail", `${error?.message || error || ""}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const stopReadyRound2 = await pollUntil(async () => {
    if (!await safeVisible(stopRecordButton)) return null;
    if (!await safeEnabled(stopRecordButton)) return null;
    return { ready: true };
  }, 30000, 500);

  if (!stopReadyRound2.ok) {
    pushStep("record.round2.stop_ready", "第二题录音可结束（失败诊断验证）", "fail", "停止按钮未可用。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    if (window.__RTS_FORCE_OBJECT_URL_FAIL_INSTALLED__) return;
    window.__RTS_FORCE_OBJECT_URL_FAIL_INSTALLED__ = true;
    const originalCreate = URL.createObjectURL.bind(URL);
    let remainingFails = 3;
    URL.createObjectURL = function patchedCreateObjectURL(...args) {
      if (remainingFails > 0) {
        remainingFails -= 1;
        throw new Error("forced_createObjectURL_fail");
      }
      return originalCreate(...args);
    };
  });

  try {
    await stopRecordButton.click({ timeout: 10000 });
  } catch (error) {
    pushStep("record.round2.stop", "第二题结束录音（失败诊断验证）", "fail", `${error?.message || error || ""}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const playbackRound2Ready = await pollUntil(async () => {
    const diagVisible = await safeVisible(page.locator("text=录音诊断（最近一次 stop）").first());
    const unavailableVisible = await safeVisible(page.locator("text=录音无效").first())
      || await safeVisible(page.locator("text=请重录").first())
      || await safeVisible(page.locator("text=回放不可用").first());
    if (diagVisible || unavailableVisible) return { diagVisible, unavailableVisible };
    return null;
  }, 45000, 500);

  if (!playbackRound2Ready.ok) {
    pushStep("record.round2.playback", "第二题失败场景进入回放区", "fail", "未进入预期失败回放状态。");
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const playback2 = await getPlaybackSnapshot();
  result.snapshots.playbackRound2 = playback2;

  const snap2Path = `${artifactDir}/${browserLabel}-rts-playback-round2-failure.png`;
  try {
    await page.screenshot({ path: snap2Path, fullPage: true });
    result.snapshots.playbackRound2Screenshot = snap2Path;
  } catch (error) {
    result.notes.push(`round2 screenshot failed: ${`${error?.message || error || ""}`.trim()}`);
  }

  const diagTopVisiblePass = playback2.diagVisible
    && playback2.unavailableMessageVisible
    && (
      playback2.diagTop === null
      || playback2.unavailableTop === null
      || playback2.diagTop <= playback2.unavailableTop
    );

  pushStep(
    "record.3.failure_diag_top",
    "失败时回放区顶部可直接看到诊断信息",
    diagTopVisiblePass ? "pass" : "fail",
    `diagVisible=${playback2.diagVisible}, unavailableVisible=${playback2.unavailableMessageVisible}, diagTop=${playback2.diagTop}, unavailableTop=${playback2.unavailableTop}`
  );

  result.finishedAt = new Date().toISOString();
  return result;
}
