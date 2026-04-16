async (page) => {
  const baseUrl = "http://127.0.0.1:5173";
  const email = "156277702@qq.com";
  const password = "050103";

  const recorderEvents = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const networkFailures = [];
  const eventTasks = [];

  const toSerializable = async (arg) => {
    try {
      return await arg.jsonValue();
    } catch {
      try {
        return arg.toString();
      } catch {
        return "[unserializable]";
      }
    }
  };

  page.on("console", (msg) => {
    const task = (async () => {
      const type = `${msg.type() || ""}`.toLowerCase();
      const text = `${msg.text() || ""}`.trim();
      const args = [];
      for (const arg of msg.args()) {
        args.push(await toSerializable(arg));
      }

      if (type === "error") {
        consoleErrors.push({ type, text, args });
      } else if (type === "warning" || type === "warn") {
        consoleWarnings.push({ type, text, args });
      }

      const first = `${args[0] || ""}`;
      const second = `${args[1] || ""}`;
      if (first.includes("[rts-recorder]") && second) {
        recorderEvents.push({
          type,
          event: second,
          payload: (args[2] && typeof args[2] === "object") ? args[2] : null,
          text,
          args
        });
      }
    })();
    eventTasks.push(task);
  });

  page.on("pageerror", (error) => {
    pageErrors.push(`${error?.message || error || ""}`.trim());
  });

  page.on("requestfailed", (request) => {
    networkFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "UNKNOWN"
    });
  });

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
          return { ok: true, value, elapsedMs: Date.now() - started };
        }
        lastValue = value;
      } catch (error) {
        lastValue = { error: `${error?.message || error || ""}`.trim() };
      }
      await page.waitForTimeout(intervalMs);
    }
    return { ok: false, value: lastValue, elapsedMs: Date.now() - started };
  };

  const safeStep = async (name, fn) => {
    try {
      const value = await fn();
      return { name, ok: true, value };
    } catch (error) {
      return { name, ok: false, error: `${error?.message || error || ""}`.trim() };
    }
  };

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
  await page.addInitScript(() => {
    try {
      window.localStorage?.setItem("RTS_RECORDER_DEBUG", "1");
    } catch {
      // no-op
    }
  });

  try {
    await page.context().grantPermissions(["microphone"], { origin: baseUrl });
  } catch {
    // no-op
  }

  const steps = [];

  steps.push(await safeStep("open_auth", async () => {
    await page.goto(`${baseUrl}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
    return { url: page.url() };
  }));

  steps.push(await safeStep("login_if_needed", async () => {
    if (!page.url().includes("/auth")) return { skipped: true, url: page.url() };

    const emailInput = page.locator('input[placeholder="your@email.com"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.waitFor({ timeout: 20000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await passwordInput.press("Enter");

    const loggedIn = await pollUntil(async () => (!page.url().includes("/auth") ? { url: page.url() } : null), 30000, 500);
    if (!loggedIn.ok) {
      const loginBtn = page.locator('button:has-text("登录"), button:has-text("Sign in"), button:has-text("Log in")').first();
      if (await safeVisible(loginBtn)) {
        await loginBtn.click({ timeout: 5000 });
      }
    }

    const confirmed = await pollUntil(async () => (!page.url().includes("/auth") ? { url: page.url() } : null), 20000, 500);
    if (!confirmed.ok) throw new Error("still_on_auth_after_login");
    return confirmed.value;
  }));

  steps.push(await safeStep("open_rts_debug", async () => {
    await page.goto(`${baseUrl}/rts/practice?debugRecorder=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    return { url: page.url() };
  }));

  const manualSceneButton = page.locator('button:has-text("点击播放场景音频")').first();
  const preparingHint = page.locator('text=准备阶段会在').first();
  const startRecordButton = page.locator('button:has-text("准备完毕，开始回应")').first();
  const stopRecordButton = page.locator('button:has-text("正在录音")').first();

  steps.push(await safeStep("reach_prepare_phase", async () => {
    const state = await pollUntil(async () => {
      if (await safeVisible(startRecordButton)) return { state: "prepare_ready" };
      if (await safeVisible(preparingHint)) return { state: "preparing" };
      if (await safeVisible(manualSceneButton)) return { state: "manual_scene_needed" };
      return null;
    }, 60000, 500);

    if (!state.ok) throw new Error("prepare_phase_timeout");

    if (state.value.state === "manual_scene_needed") {
      await manualSceneButton.click({ timeout: 10000 });
      const resumed = await pollUntil(async () => {
        if (await safeVisible(startRecordButton)) return { state: "prepare_ready" };
        if (await safeVisible(preparingHint)) return { state: "preparing" };
        return null;
      }, 60000, 500);
      if (!resumed.ok) throw new Error("manual_scene_resume_timeout");
      return { initial: state.value.state, resumed: resumed.value.state };
    }

    return { initial: state.value.state };
  }));

  const startAttempts = [];
  let startedRecording = false;

  for (let i = 1; i <= 4; i += 1) {
    if (!(await safeVisible(startRecordButton))) {
      const ready = await pollUntil(async () => (await safeVisible(startRecordButton) ? { ok: true } : null), 15000, 400);
      if (!ready.ok) break;
    }

    await startRecordButton.click({ timeout: 10000 });

    const started = await pollUntil(async () => {
      const stopVisible = await safeVisible(stopRecordButton);
      const stopEnabled = stopVisible ? await safeEnabled(stopRecordButton) : false;
      if (stopVisible) return { state: "recording", stopEnabled };
      if (await safeVisible(startRecordButton)) return { state: "returned_prepare" };
      return null;
    }, 12000, 400);

    if (started.ok) {
      startAttempts.push({ attempt: i, ...started.value });
      if (started.value.state === "recording") {
        startedRecording = true;
        break;
      }
    } else {
      startAttempts.push({ attempt: i, state: "timeout_wait_start" });
    }
  }

  steps.push({ name: "start_attempts", ok: startedRecording, value: { startedRecording, startAttempts } });

  let stopResult = { skipped: true };
  if (startedRecording) {
    stopResult = await safeStep("stop_to_playback", async () => {
      const stopReady = await pollUntil(async () => {
        if (!(await safeVisible(stopRecordButton))) return null;
        if (!(await safeEnabled(stopRecordButton))) return null;
        return { ready: true };
      }, 45000, 500);
      if (!stopReady.ok) throw new Error("stop_button_not_ready");

      await page.waitForTimeout(1000);
      await stopRecordButton.click({ timeout: 8000 });

      const playback = await pollUntil(async () => {
        const audioVisible = await safeVisible(page.locator("audio[controls]").first());
        const diagVisible = await safeVisible(page.locator("text=录音诊断（最近一次 stop）").first());
        const unavailableVisible = await safeVisible(page.locator("text=录音无效").first())
          || await safeVisible(page.locator("text=回放不可用").first())
          || await safeVisible(page.locator("text=请重录").first());
        if (audioVisible || diagVisible || unavailableVisible) {
          return { audioVisible, diagVisible, unavailableVisible };
        }
        return null;
      }, 50000, 500);
      if (!playback.ok) throw new Error("playback_not_ready");
      return playback.value;
    });
    steps.push(stopResult);
  }

  await Promise.allSettled(eventTasks);

  const startEvents = recorderEvents
    .filter((item) => ["start_requested", "start_success", "start_failed", "start_exception"].includes(item.event))
    .map((item) => ({
      event: item.event,
      startMeta: item.payload?.startMeta || null,
      recorderError: item.payload?.recorderError || "",
      startLatencyMs: Number(item.payload?.startLatencyMs || 0)
    }));

  const startRequestedCount = startEvents.filter((item) => item.event === "start_requested").length;
  const startFailedCount = startEvents.filter((item) => item.event === "start_failed" || item.event === "start_exception").length;
  const startSuccessCount = startEvents.filter((item) => item.event === "start_success").length;

  const latestStartMeta = [...startEvents].reverse().map((item) => item.startMeta).find((meta) => meta && typeof meta === "object") || null;

  const diagPanel = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("section")).find((node) => `${node?.innerText || ""}`.includes("录音诊断"));
    const text = `${panel?.innerText || ""}`;
    const keys = [
      "secureContext",
      "hasGetUserMedia",
      "hasMediaRecorder",
      "lastMediaRecorderAttemptErrorCode",
      "webAudioFallbackTried",
      "webAudioFallbackOk"
    ];
    const keyPresence = {};
    for (const key of keys) {
      keyPresence[key] = text.includes(key);
    }
    return {
      visible: Boolean(panel),
      keyPresence,
      excerpt: text.slice(0, 4000)
    };
  });

  const ua = await page.evaluate(() => navigator.userAgent || "");

  return {
    browserUa: ua,
    startedRecording,
    startRequestedCount,
    startFailedCount,
    startSuccessCount,
    hasStartFailedLoop: startFailedCount > 1,
    startEvents,
    latestStartMeta,
    diagPanel,
    steps,
    consoleErrors,
    consoleWarnings,
    pageErrors,
    networkFailures
  };
}

